import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantService } from './tenant.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../entities/user.entity';

@Controller('tenant')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('info')
  async getTenantInfo(@CurrentUser() user) {
    return this.tenantService.getTenantInfo(user.tenantId);
  }

  @Put('info')
  @Roles(UserRole.TENANT_ADMIN)
  async updateTenant(@CurrentUser() user, @Body() data: { name?: string; description?: string }) {
    return this.tenantService.updateTenant(user.tenantId, data);
  }

  @Get('users')
  @Roles(UserRole.TENANT_ADMIN)
  async getUsers(@CurrentUser() user) {
    return this.tenantService.getUsers(user);
  }

  @Get('users/:id')
  async getUser(@CurrentUser() user, @Param('id') userId: string) {
    return this.tenantService.getUserById(user, userId);
  }

  @Post('users')
  @Roles(UserRole.TENANT_ADMIN)
  async createUser(@CurrentUser() user, @Body() createUserDto: CreateUserDto) {
    return this.tenantService.createUser(user, createUserDto);
  }

  @Put('users/:id')
  async updateUser(
    @CurrentUser() user,
    @Param('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.tenantService.updateUser(user, userId, updateUserDto);
  }

  @Delete('users/:id')
  @Roles(UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@CurrentUser() user, @Param('id') userId: string) {
    await this.tenantService.deleteUser(user, userId);
  }

  @Post('users/:id/reset-password')
  @Roles(UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @CurrentUser() user,
    @Param('id') userId: string,
    @Body('password') password: string,
  ) {
    await this.tenantService.resetPassword(user, userId, password);
  }
}
