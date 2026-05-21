import { Router } from 'express';

import adminRouter from './admin/admin.router';
import authRouter from './auth/auth.routes';
import doraRouter from './dora/dora.routes';
import exportRouter from './export/export.routes';
import meRouter from './me/me.routes';
import uploadRouter from './media/media.routes';
import teamsRouter from './teams/teams.routes';
import userRouter from './user/user.routes';

const router = Router();

// ===== Существующие модули =====
router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/uploads', uploadRouter);

// ===== CherryGit: пользовательские эндпоинты =====
router.use('/me', meRouter);
router.use('/teams', teamsRouter); // включает nested /teams/:teamUid/metrics, /bus-factor, ...
router.use('/dora', doraRouter); // HEAD only
router.use('/export', exportRouter);

// ===== CherryGit: admin-эндпоинты =====
router.use('/admin', adminRouter);

export default router;
