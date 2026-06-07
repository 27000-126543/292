import { crossBorderCheckModel } from '../models/operations';
import { transactionModel } from '../models/trading';
import type { CrossBorderCheck } from '../types';
import { addMinutes, now, isExpired } from '../utils';
import { wsService } from './websocket';
import { config } from '../config';

export interface InitiateCheckInput {
  transactionId: string;
  fromRegion: string;
  toRegion: string;
  intermediateRegions?: string[];
}

export interface ProcessCheckInput {
  checkId: string;
  region: string;
  status: 'approved' | 'rejected';
  checker: string;
  comment?: string;
}

class CrossBorderService {
  initiateCheck(input: InitiateCheckInput): CrossBorderCheck {
    const transaction = transactionModel.findById(input.transactionId);
    if (!transaction) {
      throw new Error('交易不存在');
    }

    const regions = [input.fromRegion, ...(input.intermediateRegions || []), input.toRegion];
    const checks = regions.map(region => ({
      region,
      status: 'pending' as const,
      checkedAt: undefined,
      checker: undefined,
      comment: undefined
    }));

    const check = crossBorderCheckModel.create({
      transactionId: input.transactionId,
      fromRegion: input.fromRegion,
      toRegion: input.toRegion,
      status: 'checking',
      checks,
      expiresAt: addMinutes(now(), config.rules.safetyCheckTimeout / 60000)
    });

    wsService.broadcast({
      type: 'cross_border_check_initiated',
      payload: check,
      targetRoles: ['trading_center', 'dispatch_center']
    });

    this.startCheckTimeout(check.id);

    return check;
  }

  processCheck(input: ProcessCheckInput): CrossBorderCheck {
    const check = crossBorderCheckModel.findById(input.checkId);
    if (!check) {
      throw new Error('校核申请不存在');
    }

    if (check.status === 'timeout' || check.status === 'escalated') {
      throw new Error(`校核已${check.status === 'timeout' ? '超时' : '升级'}，无法处理`);
    }

    crossBorderCheckModel.updateCheck(input.checkId, input.region, input.status, input.checker, input.comment);
    const updated = crossBorderCheckModel.findById(input.checkId)!;

    if (updated.status === 'approved') {
      transactionModel.updateStatus(check.transactionId, 'confirmed');
      wsService.sendAlert({
        type: 'system',
        severity: 'info',
        title: '跨境交易校核通过',
        message: `交易${check.transactionId}已通过所有区域安全校核`,
        relatedId: check.transactionId,
        targetRoles: ['trading_center', 'dispatch_center', 'power_producer']
      });
    } else if (updated.status === 'rejected') {
      transactionModel.updateStatus(check.transactionId, 'pending');
      wsService.sendAlert({
        type: 'system',
        severity: 'warning',
        title: '跨境交易校核被驳回',
        message: `交易${check.transactionId}在区域${input.region}被驳回：${input.comment || '未说明原因'}`,
        relatedId: check.transactionId,
        targetRoles: ['trading_center', 'dispatch_center', 'power_producer']
      });
    }

    wsService.broadcast({
      type: 'cross_border_check_updated',
      payload: updated,
      targetRoles: ['trading_center', 'dispatch_center']
    });

    return updated;
  }

  private startCheckTimeout(checkId: string) {
    const check = crossBorderCheckModel.findById(checkId);
    if (!check) return;

    const timeoutMs = new Date(check.expiresAt).getTime() - Date.now();
    if (timeoutMs > 0) {
      setTimeout(() => {
        const current = crossBorderCheckModel.findById(checkId);
        if (current && current.status === 'checking') {
          this.handleTimeout(checkId);
        }
      }, Math.min(timeoutMs, 2147483647));
    }
  }

  private handleTimeout(checkId: string) {
    const check = crossBorderCheckModel.findById(checkId);
    if (!check) return;

    const pendingChecks = check.checks.filter(c => c.status === 'pending');
    
    if (pendingChecks.length > 0) {
      crossBorderCheckModel.escalate(checkId);
      const escalated = crossBorderCheckModel.findById(checkId)!;

      wsService.sendAlert({
        type: 'check_timeout',
        severity: 'warning',
        title: '跨境校核超时升级',
        message: `交易${check.transactionId}的安全校核超时，未响应区域: ${pendingChecks.map(c => c.region).join(', ')}。已转上级调度处理`,
        relatedId: check.id,
        targetRoles: ['trading_center', 'dispatch_center']
      });

      wsService.broadcast({
        type: 'cross_border_check_escalated',
        payload: escalated,
        targetRoles: ['dispatch_center']
      });
    }

    crossBorderCheckModel.setTimeout(checkId);
  }

  checkPendingTimeouts() {
    const pending = crossBorderCheckModel.findPending();
    pending.forEach(check => {
      if (isExpired(check.expiresAt) && !check.escalated) {
        this.handleTimeout(check.id);
      }
    });
  }

  getAllChecks(): CrossBorderCheck[] {
    return crossBorderCheckModel.findAll();
  }

  getCheckById(id: string): CrossBorderCheck | undefined {
    return crossBorderCheckModel.findById(id);
  }

  getCheckByTransaction(transactionId: string): CrossBorderCheck | undefined {
    return crossBorderCheckModel.findByTransaction(transactionId);
  }
}

export const crossBorderService = new CrossBorderService();
