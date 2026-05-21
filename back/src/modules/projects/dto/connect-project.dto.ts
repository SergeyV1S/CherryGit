export class ConnectProjectDto {
  gitlabConnectionUid!: string;
  gitlabProjectId!: number;
  /** Привязка к команде(ам) при подключении (UC-01 шаг 7) */
  teamUids?: string[];
  releaseTagPattern?: string;
  hotfixLabel?: string;
  revertLabel?: string;
}

export class UpdateProjectDto {
  releaseTagPattern?: string;
  hotfixLabel?: string;
  revertLabel?: string;
}

export class CreateCodeModuleDto {
  name!: string;
  pathPattern!: string;
  description?: string;
}
