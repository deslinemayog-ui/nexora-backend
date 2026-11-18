module.exports = {
  apps: [
    {
      name: 'nexora-ai',
      script: './dist/main.js',
      instances: 1, // Single instance required for stateful Baileys WhatsApp WebSocket session
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
