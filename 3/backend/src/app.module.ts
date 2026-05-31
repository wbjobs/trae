import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { FormModule } from './modules/form/form.module';
import { FormSubmissionModule } from './modules/form-submission/form-submission.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { SyncTaskModule } from './modules/sync-task/sync-task.module';

import { Tenant } from './entities/tenant.entity';
import { User } from './entities/user.entity';
import { Form } from './entities/form.entity';
import { FormVersion } from './entities/form-version.entity';
import { FormSubmission } from './entities/form-submission.entity';
import { ApprovalFlow } from './entities/approval-flow.entity';
import { ApprovalNode } from './entities/approval-node.entity';
import { ApprovalInstance } from './entities/approval-instance.entity';
import { ApprovalTask } from './entities/approval-task.entity';
import { Notification } from './entities/notification.entity';
import { SyncTask } from './entities/sync-task.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_DATABASE', 'lowcode_form_engine'),
        entities: [
          Tenant,
          User,
          Form,
          FormVersion,
          FormSubmission,
          ApprovalFlow,
          ApprovalNode,
          ApprovalInstance,
          ApprovalTask,
          Notification,
          SyncTask,
        ],
        synchronize: true,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    TenantModule,
    FormModule,
    FormSubmissionModule,
    NotificationModule,
    ApprovalModule,
  ],
})
export class AppModule {}
