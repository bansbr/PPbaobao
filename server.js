import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountApi } from './src/api.js';
import { DATA_DIR } from './src/db.js';
import { bootstrapAdmin } from './src/bootstrap.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');

// 幂等：只在没有任何系统管理员时补建初始管理员，已有账号一律保留
const adminBoot = bootstrapAdmin();

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// WHO 标准数据供前端绘图使用（与后端评估共用同一份文件）
app.get('/data/who-lms.json', (_req, res) => {
  res.sendFile(path.join(ROOT, 'src', 'data', 'who-lms.json'));
});

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.0.0', dataDir: DATA_DIR }));

mountApi(app);

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html', maxAge: 0 }));

app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: '请求体不是合法 JSON' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: '请求内容超过大小上限（备份 25MB / 含照片记录 8MB / 其他 1MB），请精简后重试' });
  if (err?.status >= 400 && err?.status < 500) return res.status(err.status).json({ error: err.message });
  console.error('[error]', err);
  res.status(500).json({ error: '服务器内部错误，请查看容器日志' });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`\n  宝宝成长记录系统已启动`);
  console.log(`  本机访问：http://localhost:${PORT}`);
  console.log(`  数据目录：${DATA_DIR}`);
  console.log(`  数据库文件：${path.join(DATA_DIR, 'baby-journal.db')}`);
  console.log(`  账号模式：公开注册已关闭，账号由系统管理员统一创建`);
  // 日志不打印任何凭据：初始密码写在 README 或 ADMIN_PASSWORD 环境变量里
  if (adminBoot.action === 'created') {
    console.log(`  初始管理员：${adminBoot.username}（初始密码见部署说明，请登录后立即修改）`);
  } else if (adminBoot.action === 'promoted') {
    console.log(`  已把已有账号 ${adminBoot.username} 提升为系统管理员（密码沿用原值）`);
  } else {
    console.log('  系统管理员：已存在，未改动任何账号');
  }
  if (adminBoot.usingDefaultPassword) {
    console.warn('  ⚠️ 初始管理员仍在使用默认初始密码，请尽快在「设置与协作 → 账号安全」中修改！\n');
  } else {
    console.log('');
  }
});
