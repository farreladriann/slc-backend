import express, { Application, NextFunction, Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import bodyParser from 'body-parser';
import morgan from 'morgan';
import createHttpError from 'http-errors';
import helmet from 'helmet';
import cors from 'cors';
import { prisma, Prisma } from './lib/prisma';
import knapsackRoute from './routes/knapsackRoute';
import { connectMqtt } from './services/mqttService';
import terminalRoute from './routes/terminalRoute';
import scheduleRoute from './routes/scheduleRoute';


const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = express();


app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(helmet());

// register routes
app.use('/api/terminals', terminalRoute);
app.use('/api/knapsack', knapsackRoute);

// schedule route
app.use('/api/schedule', scheduleRoute);

connectMqtt(); //connect MQTT sekali saat server start


app.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  const { userGoogleId, userEmail, userName, stm32Id } = req.body ?? {};
  if (!userGoogleId || !userEmail || !userName) {
    return res.status(400).json({ message: 'userGoogleId, userEmail, userName wajib' });
  }
  try {
    const user = await prisma.user.create({
      data: {
        userGoogleId,
        userEmail,
        userName,
        ...(stm32Id ? { stm32Id } : {}),
      },
    });
    return res.status(201).json(user);
  } catch (err: unknown) {
    // Cek apakah error dari Prisma dan memiliki properti "code"
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err as Prisma.PrismaClientKnownRequestError).code === 'P2002'
    ) {
      return res.status(409).json({ message: 'userEmail sudah ada' });
    }
    // Jika error umum
    if (err instanceof Error) {
      return next(err);
    }
    // Jika bukan instance dari Error
    return next(new Error(String(err)));
  }
});

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(createHttpError(404, 'Not Found'));
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof createHttpError.HttpError) {
    const httpError = err as createHttpError.HttpError;
    res.status(httpError.status).json({ message: httpError.message });
  } else {
    console.error(err);
    res.status(500).json({
      message: err.message.length > 40 ? 'Internal Server Error' : err.message,
    });
  }
});

// Export untuk Vercel serverless
export default app;

// Jalankan server lokal jika bukan di Vercel
if (process.env.VERCEL !== '1') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  async function shutdown() {
    try {
      console.log('Shutting down server...');
      await prisma.$disconnect();
      console.log('Database connection closed.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  }
}