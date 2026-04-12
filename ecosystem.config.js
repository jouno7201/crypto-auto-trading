module.exports = {
  apps: [
    {
      name: 'crypto-bot',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3008,
      },
      // 자동 재시작 설정
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      // 로그 (로테이션 포함)
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_size: '100M',
      retain: 5,
      // 헬스체크 (PM2 Plus 또는 cron으로 /health 폴링)
      // pm2 start ecosystem.config.js
    },
  ],
};
