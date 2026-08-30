const path = require('node:path');

const appRoot = process.env.APP_ROOT || '/opt/lingmeng';

module.exports = {
  apps: [
    {
      name: process.env.PM2_NAME || 'lingmeng-backend',
      cwd: path.join(appRoot, 'backend'),
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1200M',
      kill_timeout: 10000,
      listen_timeout: 15000,
      env: {
        NODE_ENV: 'production',
        SERVICE_ROLE: 'api',
      },
      error_file: path.join(appRoot, 'logs', 'backend-error.log'),
      out_file: path.join(appRoot, 'logs', 'backend-out.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: process.env.PM2_WORKER_NAME || 'lingmeng-worker',
      cwd: path.join(appRoot, 'backend'),
      script: 'dist/src/worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1000M',
      kill_timeout: 30000,
      env: {
        NODE_ENV: 'production',
        SERVICE_ROLE: 'worker',
      },
      error_file: path.join(appRoot, 'logs', 'worker-error.log'),
      out_file: path.join(appRoot, 'logs', 'worker-out.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: process.env.PM2_REALTIME_NAME || 'lingmeng-realtime',
      cwd: path.join(appRoot, 'backend'),
      script: 'dist/src/realtime.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1000M',
      kill_timeout: 15000,
      listen_timeout: 15000,
      env: {
        NODE_ENV: 'production',
        SERVICE_ROLE: 'realtime',
        REALTIME_PORT: process.env.REALTIME_PORT || 3001,
      },
      error_file: path.join(appRoot, 'logs', 'realtime-error.log'),
      out_file: path.join(appRoot, 'logs', 'realtime-out.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
