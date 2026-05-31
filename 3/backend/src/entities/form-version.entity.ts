import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne } from 'typeorm';
import { Form, FormField, FormLayout } from './form.entity';

@Entity('form_versions')
export class FormVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  formId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'jsonb', nullable: true })
  fields: FormField[];

  @Column({ type: 'jsonb', nullable: true })
  layout: FormLayout;

  @Column({ length: 255, nullable: true })
  changeNote: string;

  @Column({ nullable: true })
  createdById: string;

  @ManyToOne(() => Form, (form) => form.versions, { onDelete: 'CASCADE' })
  form: Form;

  @CreateDateColumn()
  createdAt: Date;
}
