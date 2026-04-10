module.exports = {
  apps: [
    {
      name: 'crypto-bot',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      // 크래시 시 재시작 (최대 10회, 15분 이내)
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000, // 5초 대기 후 재시작
      // 로그 설정
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 8000,
    },
  ],
};
