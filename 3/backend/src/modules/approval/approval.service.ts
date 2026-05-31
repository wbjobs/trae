import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ApprovalFlow, FlowStatus } from '../../entities/approval-flow.entity';
import { ApprovalNode, NodeType, ApprovalType, ApproverConfig } from '../../entities/approval-node.entity';
import { ApprovalInstance, InstanceStatus } from '../../entities/approval-instance.entity';
import { ApprovalTask, TaskStatus } from '../../entities/approval-task.entity';
import { Form } from '../../entities/form.entity';
import { FormSubmission, SubmissionStatus } from '../../entities/form-submission.entity';
import { User, UserRole } from '../../entities/user.entity';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { NotificationService } from '../notification/notification.service';
import { FormSubmissionService } from '../form-submission/form-submission.service';

export interface CreateFlowDto {
  name: string;
  description?: string;
  formId: string;
  nodes: Omit<ApprovalNode, 'id' | 'flowId' | 'flow' | 'createdAt'>[];
}

export interface UpdateFlowDto {
  name?: string;
  description?: string;
  nodes?: Omit<ApprovalNode, 'id' | 'flowId' | 'flow' | 'createdAt'>[];
  status?: FlowStatus;
}

export interface ApproveTaskDto {
  comment?: string;
}

@Injectable()
export class ApprovalService {
  constructor(
    @InjectRepository(ApprovalFlow)
    private flowRepository: Repository<ApprovalFlow>,
    @InjectRepository(ApprovalNode)
    private nodeRepository: Repository<ApprovalNode>,
    @InjectRepository(ApprovalInstance)
    private instanceRepository: Repository<ApprovalInstance>,
    @InjectRepository(ApprovalTask)
    private taskRepository: Repository<ApprovalTask>,
    @InjectRepository(Form)
    private formRepository: Repository<Form>,
    @InjectRepository(FormSubmission)
    private submissionRepository: Repository<FormSubmission>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private notificationService: NotificationService,
    private formSubmissionService: FormSubmissionService,
  ) {}

  async getFlows(currentUser: CurrentUserPayload): Promise<ApprovalFlow[]> {
    return this.flowRepository.find({
      where: { tenantId: currentUser.tenantId },
      relations: ['form'],
      order: { updatedAt: 'DESC' },
    });
  }

  async getFlowById(currentUser: CurrentUserPayload, flowId: string): Promise<ApprovalFlow> {
    const flow = await this.flowRepository.findOne({
      where: { id: flowId, tenantId: currentUser.tenantId },
      relations: ['nodes', 'form'],
    });

    if (!flow) {
      throw new NotFoundException('审批流程不存在');
    }

    return flow;
  }

  async getFlowByFormId(currentUser: CurrentUserPayload, formId: string): Promise<ApprovalFlow | null> {
    const form = await this.formRepository.findOne({
      where: { id: formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    return this.flowRepository.findOne({
      where: { formId, tenantId: currentUser.tenantId, status: FlowStatus.ACTIVE },
      relations: ['nodes'],
    });
  }

  async createFlow(currentUser: CurrentUserPayload, dto: CreateFlowDto): Promise<ApprovalFlow> {
    const form = await this.formRepository.findOne({
      where: { id: dto.formId, tenantId: currentUser.tenantId },
    });

    if (!form) {
      throw new NotFoundException('表单不存在');
    }

    if (form.createdById !== currentUser.id && currentUser.role !== UserRole.TENANT_ADMIN) {
      throw new ForbiddenException('只有表单创建者或租户管理员可以创建审批流程');
    }

    const flow = this.flowRepository.create({
      name: dto.name,
      description: dto.description,
      formId: dto.formId,
      tenantId: currentUser.tenantId,
      createdById: currentUser.id,
      status: FlowStatus.DRAFT,
    });

    await this.flowRepository.save(flow);

    if (dto.nodes && dto.nodes.length > 0) {
      const nodes = dto.nodes.map((node, index) => 
        this.nodeRepository.create({
          ...node,
          flowId: flow.id,
          order: index,
        })
      );
      await this.nodeRepository.save(nodes);
    }

    return this.getFlowById(currentUser, flow.id);
  }

  async updateFlow(
    currentUser: CurrentUserPayload,
    flowId: string,
    dto: UpdateFlowDto,
  ): Promise<ApprovalFlow> {
    const flow = await this.flowRepository.findOne({
      where: { id: flowId, tenantId: currentUser.tenantId },
      relations: ['nodes'],
    });

    if (!flow) {
      throw new NotFoundException('审批流程不存在');
    }

    if (flow.createdById !== currentUser.id && currentUser.role !== UserRole.TENANT_ADMIN) {
      throw new ForbiddenException('只有流程创建者或租户管理员可以修改审批流程');
    }

    if (dto.name) flow.name = dto.name;
    if (dto.description !== undefined) flow.description = dto.description;
    if (dto.status) flow.status = dto.status;

    await this.flowRepository.save(flow);

    if (dto.nodes) {
      await this.nodeRepository.delete({ flowId });
      
      const nodes = dto.nodes.map((node, index) =>
        this.nodeRepository.create({
          ...node,
          flowId: flow.id,
          order: index,
        })
      );
      await this.nodeRepository.save(nodes);
    }

    return this.getFlowById(currentUser, flow.id);
  }

  async deleteFlow(currentUser: CurrentUserPayload, flowId: string): Promise<void> {
    const flow = await this.flowRepository.findOne({
      where: { id: flowId, tenantId: currentUser.tenantId },
    });

    if (!flow) {
      throw new NotFoundException('审批流程不存在');
    }

    if (flow.createdById !== currentUser.id && currentUser.role !== UserRole.TENANT_ADMIN) {
      throw new ForbiddenException('只有流程创建者或租户管理员可以删除审批流程');
    }

    const activeInstances = await this.instanceRepository.count({
      where: {
        flowId,
        status: In([InstanceStatus.PENDING, InstanceStatus.IN_PROGRESS]),
      },
    });

    if (activeInstances > 0) {
      throw new BadRequestException('存在进行中的审批实例，无法删除流程');
    }

    await this.flowRepository.remove(flow);
  }

  async activateFlow(currentUser: CurrentUserPayload, flowId: string): Promise<ApprovalFlow> {
    const flow = await this.getFlowById(currentUser, flowId);
    const nodes = flow.nodes || [];

    const hasStart = nodes.some((n) => n.type === NodeType.START);
    const hasEnd = nodes.some((n) => n.type === NodeType.END);
    const hasApproval = nodes.some((n) => n.type === NodeType.APPROVAL);

    if (!hasStart || !hasEnd) {
      throw new BadRequestException('流程必须包含开始节点和结束节点');
    }

    if (!hasApproval) {
      throw new BadRequestException('流程至少需要一个审批节点');
    }

    flow.status = FlowStatus.ACTIVE;
    await this.flowRepository.save(flow);

    return flow;
  }

  async deactivateFlow(currentUser: CurrentUserPayload, flowId: string): Promise<ApprovalFlow> {
    const flow = await this.getFlowById(currentUser, flowId);
    flow.status = FlowStatus.INACTIVE;
    await this.flowRepository.save(flow);
    return flow;
  }

  async startApproval(currentUser: CurrentUserPayload, submissionId: string): Promise<ApprovalInstance> {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['form'],
    });

    if (!submission) {
      throw new NotFoundException('提交记录不存在');
    }

    const form = submission.form;
    if (form.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException('无权操作');
    }

    const flow = await this.flowRepository.findOne({
      where: {
        formId: submission.formId,
        tenantId: currentUser.tenantId,
        status: FlowStatus.ACTIVE,
      },
      relations: ['nodes'],
    });

    if (!flow) {
      throw new BadRequestException('该表单未配置审批流程');
    }

    if (submission.status === SubmissionStatus.PENDING_APPROVAL) {
      throw new BadRequestException('该提交已在审批流程中');
    }

    const nodes = flow.nodes?.sort((a, b) => a.order - b.order) || [];
    const startNode = nodes.find((n) => n.type === NodeType.START);

    if (!startNode) {
      throw new BadRequestException('审批流程配置错误');
    }

    const nextNode = this.findNextApprovalNode(nodes, startNode, submission.data);

    const instance = this.instanceRepository.create({
      flowId: flow.id,
      submissionId: submission.id,
      tenantId: currentUser.tenantId,
      currentNodeId: nextNode?.id,
      status: nextNode ? InstanceStatus.IN_PROGRESS : InstanceStatus.APPROVED,
      context: { submitterId: currentUser.id },
    });

    await this.instanceRepository.save(instance);

    submission.approvalInstanceId = instance.id;
    submission.status = nextNode ? SubmissionStatus.PENDING_APPROVAL : SubmissionStatus.APPROVED;
    await this.submissionRepository.save(submission);

    if (nextNode) {
      await this.createApprovalTasks(instance, nextNode, submission, nodes);
    }

    return instance;
  }

  private findNextApprovalNode(
    nodes: ApprovalNode[],
    currentNode: ApprovalNode,
    formData: Record<string, any>,
  ): ApprovalNode | null {
    const sortedNodes = nodes.sort((a, b) => a.order - b.order);
    const currentIndex = sortedNodes.findIndex((n) => n.id === currentNode.id);

    if (currentIndex === -1) {
      return null;
    }

    for (let i = currentIndex + 1; i < sortedNodes.length; i++) {
      const node = sortedNodes[i];

      if (node.type === NodeType.CONDITION && node.condition) {
        const fieldValue = formData[node.condition.field];
        const conditionMet = this.evaluateCondition(fieldValue, node.condition);

        if (!conditionMet) {
          continue;
        }
      }

      if (node.type === NodeType.APPROVAL) {
        return node;
      }

      if (node.type === NodeType.END) {
        return null;
      }
    }

    return null;
  }

  private evaluateCondition(value: any, condition: { field: string; operator: string; value: any }): boolean {
    if (condition.field === undefined || condition.field === null || condition.field === '') {
      return true;
    }

    const fieldValue = value;
    const compareValue = condition.value;

    switch (condition.operator) {
      case 'eq':
        return String(fieldValue) === String(compareValue);
      case 'neq':
        return String(fieldValue) !== String(compareValue);
      case 'gt':
        return Number(fieldValue) > Number(compareValue);
      case 'lt':
        return Number(fieldValue) < Number(compareValue);
      case 'gte':
        return Number(fieldValue) >= Number(compareValue);
      case 'lte':
        return Number(fieldValue) <= Number(compareValue);
      case 'contains':
        return String(fieldValue).includes(String(compareValue));
      default:
        return true;
    }
  }

  private async createApprovalTasks(
    instance: ApprovalInstance,
    node: ApprovalNode,
    submission: FormSubmission,
    nodes: ApprovalNode[],
  ): Promise<void> {
    const approvers = await this.resolveApprovers(node.approvers, submission, instance.tenantId);

    for (const approver of approvers) {
      const task = this.taskRepository.create({
        instanceId: instance.id,
        nodeId: node.id,
        assigneeId: approver.id,
        status: TaskStatus.PENDING,
      });
      await this.taskRepository.save(task);

      await this.notificationService.sendApprovalNotification(
        instance.tenantId,
        approver.id,
        submission.id,
        submission.form?.name || '表单',
        'submit',
      );
    }
  }

  private async resolveApprovers(
    approverConfigs: ApproverConfig[] | undefined,
    submission: FormSubmission,
    tenantId: string,
  ): Promise<User[]> {
    if (!approverConfigs || approverConfigs.length === 0) {
      return [];
    }

    const approvers: User[] = [];

    for (const config of approverConfigs) {
      if (config.type === 'user') {
        const user = await this.userRepository.findOne({
          where: { id: config.value, tenantId },
        });
        if (user) approvers.push(user);
      } else if (config.type === 'role') {
        const users = await this.userRepository.find({
          where: { role: config.value as UserRole, tenantId },
        });
        approvers.push(...users);
      } else if (config.type === 'form_field') {
        const userId = submission.data[config.value];
        if (userId) {
          const user = await this.userRepository.findOne({
            where: { id: userId, tenantId },
          });
          if (user) approvers.push(user);
        }
      }
    }

    const uniqueApprovers = approvers.filter(
      (user, index, self) => index === self.findIndex((u) => u.id === user.id),
    );

    return uniqueApprovers;
  }

  async getMyTasks(currentUser: CurrentUserPayload): Promise<ApprovalTask[]> {
    return this.taskRepository.find({
      where: { assigneeId: currentUser.id, status: TaskStatus.PENDING },
      relations: ['instance', 'instance.submission', 'instance.submission.form'],
      order: { createdAt: 'DESC' },
    });
  }

  async getMyTaskHistory(currentUser: CurrentUserPayload): Promise<ApprovalTask[]> {
    return this.taskRepository.find({
      where: { assigneeId: currentUser.id },
      relations: ['instance', 'instance.submission', 'instance.submission.form'],
      order: { createdAt: 'DESC' },
    });
  }

  async getTaskById(
    currentUser: CurrentUserPayload,
    taskId: string,
  ): Promise<ApprovalTask> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
      relations: [
        'instance',
        'instance.submission',
        'instance.submission.form',
        'instance.submission.submittedBy',
      ],
    });

    if (!task) {
      throw new NotFoundException('审批任务不存在');
    }

    if (task.assigneeId !== currentUser.id) {
      throw new ForbiddenException('无权访问该任务');
    }

    return task;
  }

  async approveTask(
    currentUser: CurrentUserPayload,
    taskId: string,
    dto: ApproveTaskDto,
  ): Promise<ApprovalTask> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
      relations: ['instance', 'instance.submission', 'instance.flow', 'instance.flow.nodes'],
    });

    if (!task) {
      throw new NotFoundException('审批任务不存在');
    }

    if (task.assigneeId !== currentUser.id) {
      throw new ForbiddenException('无权处理该任务');
    }

    if (task.status !== TaskStatus.PENDING) {
      throw new BadRequestException('该任务已处理');
    }

    const instance = task.instance;
    const submission = instance.submission;
    const nodes = instance.flow?.nodes?.sort((a, b) => a.order - b.order) || [];
    const currentNode = nodes.find((n) => n.id === task.nodeId);

    task.status = TaskStatus.APPROVED;
    task.comment = dto.comment;
    task.completedAt = new Date();
    await this.taskRepository.save(task);

    if (currentNode) {
      const shouldProceed = await this.shouldProceedToNextNode(
        instance.id,
        currentNode,
        nodes,
      );

      if (shouldProceed) {
        const nextNode = this.findNextApprovalNode(nodes, currentNode, submission.data);

        if (nextNode) {
          instance.currentNodeId = nextNode.id;
          instance.status = InstanceStatus.IN_PROGRESS;
          await this.instanceRepository.save(instance);
          await this.createApprovalTasks(instance, nextNode, submission, nodes);
        } else {
          instance.status = InstanceStatus.APPROVED;
          instance.currentNodeId = null;
          await this.instanceRepository.save(instance);
          await this.formSubmissionService.updateSubmissionStatus(
            submission.id,
            SubmissionStatus.APPROVED,
          );

          await this.notificationService.sendApprovalNotification(
            instance.tenantId,
            submission.submittedById || '',
            submission.id,
            submission.form?.name || '表单',
            'approve',
          );
        }
      }
    }

    return task;
  }

  async rejectTask(
    currentUser: CurrentUserPayload,
    taskId: string,
    dto: ApproveTaskDto,
  ): Promise<ApprovalTask> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
      relations: ['instance', 'instance.submission'],
    });

    if (!task) {
      throw new NotFoundException('审批任务不存在');
    }

    if (task.assigneeId !== currentUser.id) {
      throw new ForbiddenException('无权处理该任务');
    }

    if (task.status !== TaskStatus.PENDING) {
      throw new BadRequestException('该任务已处理');
    }

    const instance = task.instance;
    const submission = instance.submission;

    task.status = TaskStatus.REJECTED;
    task.comment = dto.comment;
    task.completedAt = new Date();
    await this.taskRepository.save(task);

    instance.status = InstanceStatus.REJECTED;
    instance.currentNodeId = null;
    await this.instanceRepository.save(instance);

    await this.formSubmissionService.updateSubmissionStatus(
      submission.id,
      SubmissionStatus.REJECTED,
    );

    await this.notificationService.sendApprovalNotification(
      instance.tenantId,
      submission.submittedById || '',
      submission.id,
      submission.form?.name || '表单',
      'reject',
    );

    return task;
  }

  private async shouldProceedToNextNode(
    instanceId: string,
    currentNode: ApprovalNode,
    nodes: ApprovalNode[],
  ): Promise<boolean> {
    const tasks = await this.taskRepository.find({
      where: { instanceId, nodeId: currentNode.id },
    });

    const approvalType = currentNode.approvalType || ApprovalType.SINGLE;

    if (approvalType === ApprovalType.SINGLE || approvalType === ApprovalType.OR) {
      const hasApproved = tasks.some((t) => t.status === TaskStatus.APPROVED);
      return hasApproved;
    }

    if (approvalType === ApprovalType.AND) {
      const allApproved = tasks.every((t) => t.status === TaskStatus.APPROVED);
      return allApproved;
    }

    return true;
  }

  async getInstanceById(
    currentUser: CurrentUserPayload,
    instanceId: string,
  ): Promise<ApprovalInstance> {
    const instance = await this.instanceRepository.findOne({
      where: { id: instanceId, tenantId: currentUser.tenantId },
      relations: [
        'tasks',
        'tasks.instance',
        'submission',
        'submission.form',
        'submission.submittedBy',
        'flow',
        'flow.nodes',
      ],
    });

    if (!instance) {
      throw new NotFoundException('审批实例不存在');
    }

    return instance;
  }
}
