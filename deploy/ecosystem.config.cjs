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
      },
      error_file: path.join(appRoot, 'logs', 'backend-error.log'),
      out_file: path.join(appRoot, 'logs', 'backend-out.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
