import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tablesRouter from "./tables";
import menuRouter from "./menu";
import ordersRouter from "./orders";
import kitchenRouter from "./kitchen";
import paymentsRouter from "./payments";
import inventoryRouter from "./inventory";
import staffRouter from "./staff";
import financeRouter from "./finance";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tablesRouter);
router.use(menuRouter);
router.use(ordersRouter);
router.use(kitchenRouter);
router.use(paymentsRouter);
router.use(inventoryRouter);
router.use(staffRouter);
router.use(financeRouter);
router.use(settingsRouter);
router.use(dashboardRouter);

export default router;
