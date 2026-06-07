import { dispatchModel } from '../models/operations';
import type { DispatchInstruction } from '../types';
import { now, addMinutes } from '../utils';
import { wsService } from './websocket';
import { config } from '../config';

export interface CreateDispatchInput {
  transactionId?: string;
  generatorId: string;
  plantId: string;
  targetOutput: number;
  startTime: string;
  endTime: string;
  issuedBy: string;
}

export interface DispatchExecutionUpdate {
  actualOutput: number;
  status: 'executing' | 'completed' | 'failed' | 'violated';
}

class DispatchService {
  private monitorTimer: NodeJS.Timeout | null = null;

  startMonitor() {
    if (this.monitorTimer) return;
    
    this.monitorTimer = setInterval(() => {
      this.monitorInstructions();
    }, config.rules.dispatchMonitorInterval);
    
    console.log(`调度监控已启动，检查间隔: ${config.rules.dispatchMonitorInterval / 1000}秒`);
  }

  stopMonitor() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  private monitorInstructions() {
    const sentInstructions = dispatchModel.findAll().filter(i => i.status === 'sent');
    const nowTime = new Date(now()).getTime();

    sentInstructions.forEach(instruction => {
      const issuedTime = new Date(instruction.issuedAt).getTime();
      const elapsed = nowTime - issuedTime;

      if (!instruction.acknowledgedAt && elapsed > config.rules.dispatchAckTimeout) {
        this.handleTimeoutViolation(instruction, `指令下发${(elapsed / 1000).toFixed(0)}秒未确认`);
        return;
      }

      if (instruction.actualOutput !== undefined && instruction.targetOutput > 0) {
        const deviationRatio = Math.abs(instruction.actualOutput - instruction.targetOutput) / instruction.targetOutput;
        if (deviationRatio > config.rules.dispatchDeviationThreshold && instruction.status !== 'violated') {
          this.handleDeviationViolation(instruction, deviationRatio);
        }
      }
    });

    const executingInstructions = dispatchModel.findAll().filter(i => i.status === 'executing');
    executingInstructions.forEach(instruction => {
      if (instruction.endTime && new Date(instruction.endTime).getTime() < nowTime) {
        if (instruction.actualOutput === undefined) {
          this.updateExecution(instruction.id, {
            actualOutput: 0,
            status: 'violated'
          });
        }
      }
    });
  }

  private handleTimeoutViolation(instruction: DispatchInstruction, reason: string) {
    dispatchModel.updateStatus(instruction.id, 'violated', 0);
    const updated = dispatchModel.findById(instruction.id)!;
    
    wsService.sendAlert({
      type: 'dispatch_violation',
      severity: updated.violationCount >= config.rules.maxContinuousViolations ? 'critical' : 'warning',
      title: `调度超时违规 - 第${updated.violationCount}次`,
      message: `机组${instruction.generatorId}${reason}，已自动标记为违规。当前扣分: ${updated.penaltyPoints}分`,
      relatedId: instruction.id,
      targetRoles: ['dispatch_center', 'power_producer']
    });

    if (updated.violationCount >= config.rules.maxContinuousViolations) {
      this.triggerContinuousPenalty(updated);
    }

    wsService.sendDispatchUpdate(updated);
  }

  private handleDeviationViolation(instruction: DispatchInstruction, deviationRatio: number) {
    dispatchModel.updateStatus(instruction.id, 'violated', instruction.actualOutput);
    const updated = dispatchModel.findById(instruction.id)!;
    
    wsService.sendAlert({
      type: 'dispatch_violation',
      severity: updated.violationCount >= config.rules.maxContinuousViolations ? 'critical' : 'warning',
      title: `调度出力偏差违规 - 第${updated.violationCount}次`,
      message: `机组${instruction.generatorId}出力偏差${(deviationRatio * 100).toFixed(1)}%，超出允许范围${(config.rules.dispatchDeviationThreshold * 100).toFixed(0)}%。当前扣分: ${updated.penaltyPoints}分`,
      relatedId: instruction.id,
      targetRoles: ['dispatch_center', 'power_producer']
    });

    if (updated.violationCount >= config.rules.maxContinuousViolations) {
      this.triggerContinuousPenalty(updated);
    }

    wsService.sendDispatchUpdate(updated);
  }

  private triggerContinuousPenalty(instruction: DispatchInstruction) {
    const extraPoints = config.rules.continuousViolationExtraPenalty;
    const currentPoints = instruction.penaltyPoints + extraPoints;
    
    wsService.sendAlert({
      type: 'dispatch_violation',
      severity: 'critical',
      title: '连续违规加重处罚通知',
      message: `电厂${instruction.plantId}连续${config.rules.maxContinuousViolations}次违规，追加${extraPoints}分考核，累计${currentPoints}分。将扣减当月结算费用，信用评级下调，限制交易权限`,
      relatedId: instruction.plantId,
      targetRoles: ['dispatch_center', 'trading_center', 'power_producer']
    });

    wsService.broadcast({
      type: 'dispatch_penalty_triggered',
      payload: {
        plantId: instruction.plantId,
        violationCount: instruction.violationCount,
        totalPenaltyPoints: currentPoints,
        extraPenalty: extraPoints,
        settlementDeduction: currentPoints * 100
      },
      targetRoles: ['trading_center', 'power_producer']
    });
  }

  createInstruction(input: CreateDispatchInput): DispatchInstruction {
    const instruction = dispatchModel.create({
      ...input,
      status: 'pending'
    });

    this.sendToPlant(instruction.id);

    return instruction;
  }

  sendToPlant(instructionId: string): DispatchInstruction {
    const instruction = dispatchModel.findById(instructionId);
    if (!instruction) {
      throw new Error('调度指令不存在');
    }

    dispatchModel.updateStatus(instructionId, 'sent');
    const updated = dispatchModel.findById(instructionId)!;

    wsService.sendDispatchUpdate(updated);

    wsService.broadcast({
      type: 'dispatch_sent',
      payload: updated,
      targetRoles: ['dispatch_center', 'power_producer']
    });

    return updated;
  }

  acknowledgeInstruction(instructionId: string): DispatchInstruction {
    const instruction = dispatchModel.findById(instructionId);
    if (!instruction) {
      throw new Error('调度指令不存在');
    }

    const updated = dispatchModel.findById(instructionId)!;
    wsService.sendDispatchUpdate(updated);

    return updated;
  }

  updateExecution(instructionId: string, update: DispatchExecutionUpdate): DispatchInstruction {
    const instruction = dispatchModel.findById(instructionId);
    if (!instruction) {
      throw new Error('调度指令不存在');
    }

    const deviation = update.actualOutput - instruction.targetOutput;
    const deviationRatio = instruction.targetOutput > 0 ? Math.abs(deviation) / instruction.targetOutput : 0;

    let finalStatus = update.status;
    let violationMessage = '';

    if (deviationRatio > config.rules.dispatchDeviationThreshold && update.status !== 'violated') {
      finalStatus = 'violated';
      violationMessage = `出力偏差${(deviationRatio * 100).toFixed(1)}%，超出允许范围${(config.rules.dispatchDeviationThreshold * 100).toFixed(0)}%`;
    }

    dispatchModel.updateStatus(instructionId, finalStatus, update.actualOutput);
    const updated = dispatchModel.findById(instructionId)!;

    if (finalStatus === 'violated') {
      this.handleViolation(updated, violationMessage || '执行违规');
    }

    wsService.sendDispatchUpdate(updated);

    return updated;
  }

  private handleViolation(instruction: DispatchInstruction, reason: string) {
    const severity = instruction.violationCount >= config.rules.maxContinuousViolations ? 'critical' : 'warning';
    
    wsService.sendAlert({
      type: 'dispatch_violation',
      severity,
      title: `调度执行违规 - 第${instruction.violationCount}次`,
      message: `机组${instruction.generatorId}未按指令执行: ${reason}。当前扣分: ${instruction.penaltyPoints}分`,
      relatedId: instruction.id,
      targetRoles: ['dispatch_center', 'power_producer']
    });

    if (instruction.violationCount >= config.rules.maxContinuousViolations) {
      this.triggerContinuousPenalty(instruction);
    }
  }

  monitorActiveInstructions() {
    this.monitorInstructions();
  }

  getInstructions(filters?: { plantId?: string; generatorId?: string; status?: string }): DispatchInstruction[] {
    let instructions = dispatchModel.findAll();
    if (filters?.plantId) {
      instructions = instructions.filter(i => i.plantId === filters.plantId);
    }
    if (filters?.generatorId) {
      instructions = instructions.filter(i => i.generatorId === filters.generatorId);
    }
    if (filters?.status) {
      instructions = instructions.filter(i => i.status === filters.status);
    }
    return instructions;
  }

  getInstructionById(id: string): DispatchInstruction | undefined {
    return dispatchModel.findById(id);
  }

  getViolations(): DispatchInstruction[] {
    return dispatchModel.findViolations();
  }

  getPenaltySummary(plantId: string, startDate: string, endDate: string): { 
    totalViolations: number; 
    totalPoints: number;
    estimatedSettlementDeduction: number;
  } {
    const summary = dispatchModel.getPenaltySummary(plantId, startDate, endDate);
    return {
      ...summary,
      estimatedSettlementDeduction: summary.totalPoints * 100
    };
  }
}

export const dispatchService = new DispatchService();
