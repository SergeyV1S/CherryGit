import { notImplemented } from '@/lib/not-implemented';

/** CRUD отделов разработки (admin only). */

export class CreateDepartmentDto {
  name!: string;
  description?: string;
}

export class UpdateDepartmentDto {
  name?: string;
  description?: string;
}

export const listDepartments = async () => {
  notImplemented('departments.listDepartments');
};

export const createDepartment = async (_dto: CreateDepartmentDto) => {
  notImplemented('departments.createDepartment');
};

export const updateDepartment = async (_uid: string, _dto: UpdateDepartmentDto) => {
  notImplemented('departments.updateDepartment');
};

export const deleteDepartment = async (_uid: string) => {
  notImplemented('departments.deleteDepartment');
};
