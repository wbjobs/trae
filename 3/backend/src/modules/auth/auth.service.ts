import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../../entities/user.entity';
import { Tenant, TenantStatus } from '../../entities/tenant.entity';

export interface RegisterDto {
  tenantName: string;
  tenantSlug: string;
  userName: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    tenantId: string;
    tenantName: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const { tenantName, tenantSlug, userName, email, password } = registerDto;

    const existingTenant = await this.tenantRepository.findOne({ where: { slug: tenantSlug } });
    if (existingTenant) {
      throw new BadRequestException('租户标识已存在');
    }

    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('邮箱已被注册');
    }

    const tenant = this.tenantRepository.create({
      name: tenantName,
      slug: tenantSlug,
      status: TenantStatus.ACTIVE,
    });
    await this.tenantRepository.save(tenant);

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      name: userName,
      email,
      password: hashedPassword,
      role: UserRole.TENANT_ADMIN,
      status: UserStatus.ACTIVE,
      tenantId: tenant.id,
    });
    await this.userRepository.save(user);

    return this.generateToken(user, tenant);
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['tenant'],
    });

    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('账号已被禁用');
    }

    if (user.tenant && user.tenant.status !== TenantStatus.ACTIVE) {
      throw new UnauthorizedException('租户已被禁用');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    return this.generateToken(user, user.tenant);
  }

  private generateToken(user: User, tenant: Tenant): AuthResponse {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: tenant?.id,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenant?.id,
        tenantName: tenant?.name,
      },
    };
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['tenant'],
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    return user;
  }
}
