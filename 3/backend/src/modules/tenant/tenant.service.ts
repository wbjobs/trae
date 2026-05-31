import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant, TenantStatus } from '../../entities/tenant.entity';
import { User, UserRole, UserStatus } from '../../entities/user.entity';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
}

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getTenantInfo(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }
    return tenant;
  }

  async updateTenant(tenantId: string, data: { name?: string; description?: string }): Promise<Tenant> {
    const tenant = await this.getTenantInfo(tenantId);
    if (data.name) tenant.name = data.name;
    if (data.description) tenant.description = data.description;
    return this.tenantRepository.save(tenant);
  }

  async getUsers(currentUser: CurrentUserPayload): Promise<User[]> {
    if (currentUser.role !== UserRole.TENANT_ADMIN) {
      throw new ForbiddenException('只有租户管理员可以查看用户列表');
    }

    return this.userRepository.find({
      where: { tenantId: currentUser.tenantId },
      select: ['id', 'name', 'email', 'role', 'status', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async getUserById(currentUser: CurrentUserPayload, userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId: currentUser.tenantId },
      select: ['id', 'name', 'email', 'role', 'status', 'createdAt'],
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (currentUser.role !== UserRole.TENANT_ADMIN && currentUser.id !== userId) {
      throw new ForbiddenException('无权访问该用户信息');
    }

    return user;
  }

  async createUser(currentUser: CurrentUserPayload, createUserDto: CreateUserDto): Promise<User> {
    if (currentUser.role !== UserRole.TENANT_ADMIN) {
      throw new ForbiddenException('只有租户管理员可以创建用户');
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new BadRequestException('邮箱已被注册');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      tenantId: currentUser.tenantId,
      status: UserStatus.ACTIVE,
    });

    await this.userRepository.save(user);

    const { password, ...result } = user;
    return result as User;
  }

  async updateUser(
    currentUser: CurrentUserPayload,
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId: currentUser.tenantId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (currentUser.role !== UserRole.TENANT_ADMIN) {
      if (currentUser.id !== userId) {
        throw new ForbiddenException('无权修改该用户信息');
      }
      if (updateUserDto.role || updateUserDto.status) {
        throw new ForbiddenException('普通用户无法修改角色或状态');
      }
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existingUser) {
        throw new BadRequestException('邮箱已被使用');
      }
    }

    Object.assign(user, updateUserDto);
    await this.userRepository.save(user);

    const { password, ...result } = user;
    return result as User;
  }

  async deleteUser(currentUser: CurrentUserPayload, userId: string): Promise<void> {
    if (currentUser.role !== UserRole.TENANT_ADMIN) {
      throw new ForbiddenException('只有租户管理员可以删除用户');
    }

    if (currentUser.id === userId) {
      throw new BadRequestException('不能删除自己');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId: currentUser.tenantId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    await this.userRepository.remove(user);
  }

  async resetPassword(currentUser: CurrentUserPayload, userId: string, newPassword: string): Promise<void> {
    if (currentUser.role !== UserRole.TENANT_ADMIN) {
      throw new ForbiddenException('只有租户管理员可以重置用户密码');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId: currentUser.tenantId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await this.userRepository.save(user);
  }
}
