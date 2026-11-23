'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'musicbox.json');
const SEED_FILE = path.join(__dirname, 'data', 'musicbox.json');

function makePassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, expected] = String(stored).split(':');
    const actual = crypto.scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
}

function initialDatabase() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    users: [{
      id: 'user-admin', username: 'admin', displayName: 'Quản trị viên', role: 'admin',
      passwordHash: makePassword('123456'), active: true, createdAt: now
    }],
    rooms: [
      { id: 'takeaway', name: 'Mang về', type: 'takeaway', capacity: 0, active: true, status: 'available' },
      { id: 'box-1', name: 'Box 1', type: 'box', capacity: 6, active: true, status: 'available' },
      { id: 'box-2', name: 'Box 2', type: 'box', capacity: 8, active: true, status: 'available' },
      { id: 'box-3', name: 'Box 3', type: 'box', capacity: 10, active: true, status: 'available' },
      { id: 'box-4', name: 'Box 4', type: 'box', capacity: 12, active: true, status: 'available' },
      { id: 'box-5', name: 'Box 5', type: 'box', capacity: 15, active: true, status: 'available' },
      { id: 'box-6', name: 'Box 6', type: 'box', capacity: 8, active: true, status: 'available' }
    ],
    products: [
      { id: 'p-hour-small-am', name: 'GIỜ HÁT SÁNG BOX NHỎ (9h-13h)', category: 'Giờ hát', price: 90000, unit: 'gói', description: 'Áp dụng cho Box nhỏ · 9:00–13:00', active: true },
      { id: 'p-hour-large-pm', name: 'GIỜ HÁT CHIỀU BOX LỚN (13h-17h)', category: 'Giờ hát', price: 150000, unit: 'gói', description: 'Áp dụng cho Box lớn · 13:00–17:00', active: true },
      { id: 'p-hour-night', name: 'GIỜ HÁT TỐI (17h-00h)', category: 'Giờ hát', price: 180000, unit: 'gói', description: 'Khung giờ buổi tối', active: true },
      { id: 'p-weekend', name: 'Thứ 7, Chủ Nhật + Lễ, Tết', category: 'Giờ hát', price: 30000, unit: 'phụ thu', description: 'Phụ thu cuối tuần và ngày lễ', active: true },
      { id: 'p-hour-extra', name: 'Giờ hát phát sinh', category: 'Giờ hát', price: 60000, unit: 'giờ', description: 'Tính theo giờ sử dụng', active: true },
      { id: 'p-snack-1', name: 'Khoai tây chiên', category: 'Đồ ăn', price: 45000, unit: 'đĩa', description: 'Khoai tây chiên giòn', active: true },
      { id: 'p-snack-2', name: 'Khô gà lá chanh', category: 'Đồ ăn', price: 65000, unit: 'đĩa', description: 'Đồ ăn vặt', active: true },
      { id: 'p-snack-3', name: 'Xúc xích nướng', category: 'Đồ ăn', price: 35000, unit: 'cái', description: 'Xúc xích nướng nóng', active: true },
      { id: 'p-drink-1', name: 'Coca Cola', category: 'Nước uống', price: 25000, unit: 'lon', description: '330ml', active: true },
      { id: 'p-drink-2', name: 'Pepsi', category: 'Nước uống', price: 25000, unit: 'lon', description: '330ml', active: true },
      { id: 'p-drink-3', name: 'Trà đào cam sả', category: 'Nước uống', price: 39000, unit: 'ly', description: 'Pha chế tại quầy', active: true },
      { id: 'p-drink-4', name: 'Nước suối', category: 'Nước uống', price: 15000, unit: 'chai', description: '500ml', active: true },
      { id: 'p-combo-1', name: 'Combo Party 1', category: 'Combo', price: 199000, unit: 'combo', description: '2 nước + 1 đồ ăn vặt', active: true },
      { id: 'p-combo-2', name: 'Combo Party 2', category: 'Combo', price: 299000, unit: 'combo', description: '4 nước + 2 đồ ăn vặt', active: true }
    ],
    activeOrders: {},
    receipts: [],
    kitchenTickets: [],
    cashRecords: [],
    returnRecords: [],
    shiftLogs: [],
    settings: { storeName: 'Musicbox', branchName: 'Musicbox · Cơ sở chính', address: 'Vui lòng cập nhật địa chỉ cửa hàng', phone: '', currency: 'VND' }
  };
}

fs.mkdirSync(DATA_DIR, { recursive: true });
let db;
try {
  // When deployed to cloud storage, seed the persistent volume once from the
  // bundled sample database. Never overwrite an existing live database.
  if (!fs.existsSync(DB_FILE)) {
    if (fs.existsSync(SEED_FILE) && path.resolve(SEED_FILE) !== path.resolve(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      if (process.env.ADMIN_PASSWORD) {
        const admin = (db.users || []).find(user => user.username === 'admin');
        if (admin) admin.passwordHash = makePassword(process.env.ADMIN_PASSWORD);
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
      console.log(`Đã khởi tạo dữ liệu Musicbox tại ${DB_FILE}`);
    } else {
      db = initialDatabase();
      if (process.env.ADMIN_PASSWORD) {
        const admin = db.users.find(user => user.username === 'admin');
        if (admin) admin.passwordHash = makePassword(process.env.ADMIN_PASSWORD);
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    }
  }
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Ensure newer data sections exist when opening an older database file.
    const fresh = initialDatabase();
    for (const key of Object.keys(fresh)) {
      if (db[key] === undefined) db[key] = fresh[key];
    }
    if (!Array.isArray(db.users) || !db.users.some(u => u.username === 'admin')) {
      db.users = Array.isArray(db.users) ? db.users : [];
      db.users.unshift(fresh.users[0]);
    }
    if (!Array.isArray(db.rooms) || db.rooms.length === 0) db.rooms = fresh.rooms;
    if (!Array.isArray(db.products) || db.products.length === 0) db.products = fresh.products;
  }
} catch (error) {
  console.error('Không thể đọc data/musicbox.json:', error.message);
  process.exit(1);
}

function saveDatabase() {
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tempFile, DB_FILE);
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

function publicState() {
  return {
    version: db.version,
    rooms: db.rooms,
    products: db.products,
    users: db.users.map(safeUser),
    activeOrders: db.activeOrders,
    receipts: db.receipts.slice(0, 100),
    kitchenTickets: db.kitchenTickets.slice(0, 100),
    cashRecords: db.cashRecords.slice(0, 100),
    returnRecords: db.returnRecords.slice(0, 100),
    shiftLogs: db.shiftLogs.slice(0, 50),
    settings: db.settings
  };
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const sessions = new Map();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function broadcast(eventName = 'state:update', extra = {}) {
  saveDatabase();
  io.emit(eventName, { state: publicState(), ...extra });
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const session = sessions.get(token);
  const user = session && db.users.find(u => u.id === session.userId && u.active !== false);
  if (!user) return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  req.user = user;
  req.token = token;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Chỉ Quản trị viên mới được thực hiện thao tác này.' });
  next();
}

function makeId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function getRoom(roomId) {
  return db.rooms.find(room => room.id === roomId && room.active !== false);
}

function ensureOrder(room, user, guests = 2) {
  if (!db.activeOrders[room.id]) {
    db.activeOrders[room.id] = {
      id: makeId('order'), roomId: room.id, startedAt: new Date().toISOString(),
      guests: Math.max(1, Number(guests) || 2), customer: '', assignedStaff: user.displayName || user.username,
      items: [], notes: '', updatedAt: new Date().toISOString()
    };
  }
  room.status = 'in-use';
  return db.activeOrders[room.id];
}

function orderTotal(order) {
  return (order?.items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function localDateKey(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const session = sessions.get(token);
  const user = session && db.users.find(u => u.id === session.userId && u.active !== false);
  if (!user) return next(new Error('unauthorized'));
  socket.user = safeUser(user);
  next();
});

io.on('connection', socket => {
  socket.emit('state:update', { state: publicState() });
  socket.on('disconnect', () => {});
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Musicbox POS', time: new Date().toISOString() }));

app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.active !== false);
  if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, createdAt: Date.now() });
  res.json({ token, user: safeUser(user), state: publicState() });
});

app.get('/api/bootstrap', auth, (req, res) => res.json({ user: safeUser(req.user), state: publicState() }));
app.get('/api/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));
app.post('/api/logout', auth, (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true });
});

app.post('/api/rooms/:roomId/open', auth, (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng/box.' });
  const order = ensureOrder(room, req.user, req.body.guests);
  order.updatedAt = new Date().toISOString();
  broadcast();
  res.json({ order, state: publicState() });
});

app.patch('/api/orders/:roomId', auth, (req, res) => {
  const order = db.activeOrders[req.params.roomId];
  if (!order) return res.status(404).json({ error: 'Đơn hàng không còn hoạt động.' });
  if (req.body.customer !== undefined) order.customer = String(req.body.customer).slice(0, 120);
  if (req.body.assignedStaff !== undefined) order.assignedStaff = String(req.body.assignedStaff).slice(0, 80);
  if (req.body.guests !== undefined) order.guests = Math.max(1, Math.min(99, Number(req.body.guests) || 1));
  if (req.body.notes !== undefined) order.notes = String(req.body.notes).slice(0, 500);
  order.updatedAt = new Date().toISOString();
  broadcast();
  res.json({ order, state: publicState() });
});

app.post('/api/orders/:roomId/items', auth, (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng/box.' });
  const product = db.products.find(p => p.id === req.body.productId && p.active !== false);
  if (!product) return res.status(404).json({ error: 'Món hoặc gói hát không còn khả dụng.' });
  const order = ensureOrder(room, req.user);
  const existing = order.items.find(item => item.productId === product.id && item.note === String(req.body.note || ''));
  if (existing) existing.qty += Math.max(1, Number(req.body.qty) || 1);
  else order.items.push({ id: makeId('item'), productId: product.id, name: product.name, category: product.category, price: Number(product.price), unit: product.unit || '', qty: Math.max(1, Number(req.body.qty) || 1), note: String(req.body.note || '').slice(0, 200), addedAt: new Date().toISOString() });
  order.updatedAt = new Date().toISOString();
  broadcast();
  res.json({ order, state: publicState() });
});

app.patch('/api/orders/:roomId/items/:itemId', auth, (req, res) => {
  const order = db.activeOrders[req.params.roomId];
  if (!order) return res.status(404).json({ error: 'Đơn hàng không còn hoạt động.' });
  const item = order.items.find(row => row.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Không tìm thấy món trong đơn.' });
  if (req.body.qty !== undefined) {
    const qty = Number(req.body.qty);
    if (!Number.isFinite(qty) || qty <= 0) order.items = order.items.filter(row => row.id !== item.id);
    else item.qty = Math.min(999, Math.floor(qty));
  }
  if (req.body.note !== undefined) item.note = String(req.body.note).slice(0, 200);
  order.updatedAt = new Date().toISOString();
  broadcast();
  res.json({ order, state: publicState() });
});

app.delete('/api/orders/:roomId/items/:itemId', auth, (req, res) => {
  const order = db.activeOrders[req.params.roomId];
  if (!order) return res.status(404).json({ error: 'Đơn hàng không còn hoạt động.' });
  order.items = order.items.filter(item => item.id !== req.params.itemId);
  order.updatedAt = new Date().toISOString();
  broadcast();
  res.json({ state: publicState() });
});

app.post('/api/orders/:roomId/notify', auth, (req, res) => {
  const room = getRoom(req.params.roomId);
  const order = db.activeOrders[req.params.roomId];
  if (!room || !order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng đang mở.' });
  if (!order.items.length) return res.status(400).json({ error: 'Vui lòng thêm món trước khi thông báo.' });
  const ticket = {
    id: makeId('ticket'), roomId: room.id, roomName: room.name,
    orderId: order.id, items: JSON.parse(JSON.stringify(order.items)),
    notes: order.notes || '', status: 'new', createdAt: new Date().toISOString(), createdBy: req.user.displayName || req.user.username
  };
  db.kitchenTickets.unshift(ticket);
  order.lastNotifiedAt = ticket.createdAt;
  order.updatedAt = ticket.createdAt;
  broadcast('notification:new', { notification: ticket, actor: safeUser(req.user) });
  res.json({ ticket, state: publicState() });
});

app.post('/api/orders/:roomId/pay', auth, (req, res) => {
  const room = getRoom(req.params.roomId);
  const order = db.activeOrders[req.params.roomId];
  if (!room || !order) return res.status(404).json({ error: 'Đơn hàng không còn hoạt động.' });
  if (!order.items.length) return res.status(400).json({ error: 'Đơn hàng chưa có món để thanh toán.' });
  const total = orderTotal(order);
  const method = ['cash', 'bank', 'qr'].includes(req.body.method) ? req.body.method : 'cash';
  const receipt = {
    id: makeId('receipt'), number: `MB${Date.now().toString().slice(-8)}`,
    roomId: room.id, roomName: room.name, orderId: order.id,
    customer: order.customer || 'Khách lẻ', items: JSON.parse(JSON.stringify(order.items)),
    subtotal: total, discount: Math.max(0, Number(req.body.discount) || 0),
    total: Math.max(0, total - Math.max(0, Number(req.body.discount) || 0)),
    method, paidAt: new Date().toISOString(), cashier: req.user.displayName || req.user.username,
    status: 'paid'
  };
  db.receipts.unshift(receipt);
  delete db.activeOrders[room.id];
  room.status = 'available';
  broadcast();
  res.json({ receipt, state: publicState() });
});

app.get('/api/reports/today', auth, (req, res) => {
  const today = localDateKey();
  const receipts = db.receipts.filter(r => localDateKey(r.paidAt) === today && r.status === 'paid');
  res.json({ date: today, count: receipts.length, revenue: receipts.reduce((sum, r) => sum + r.total, 0), receipts });
});

app.post('/api/admin/rooms', auth, adminOnly, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Tên phòng không được để trống.' });
  const room = { id: makeId('room'), name, type: req.body.type === 'takeaway' ? 'takeaway' : 'box', capacity: Math.max(0, Number(req.body.capacity) || 0), active: true, status: 'available' };
  db.rooms.push(room); broadcast(); res.json({ room, state: publicState() });
});

app.put('/api/admin/rooms/:id', auth, adminOnly, (req, res) => {
  const room = db.rooms.find(r => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
  if (req.body.name !== undefined) room.name = String(req.body.name).trim().slice(0, 60) || room.name;
  if (req.body.capacity !== undefined) room.capacity = Math.max(0, Number(req.body.capacity) || 0);
  if (req.body.type !== undefined) room.type = req.body.type === 'takeaway' ? 'takeaway' : 'box';
  if (req.body.active !== undefined) room.active = Boolean(req.body.active);
  broadcast(); res.json({ room, state: publicState() });
});

app.delete('/api/admin/rooms/:id', auth, adminOnly, (req, res) => {
  if (db.activeOrders[req.params.id]) return res.status(400).json({ error: 'Phòng đang có đơn, không thể xóa.' });
  db.rooms = db.rooms.filter(room => room.id !== req.params.id);
  broadcast(); res.json({ state: publicState() });
});

app.post('/api/admin/products', auth, adminOnly, (req, res) => {
  const name = String(req.body.name || '').trim();
  const price = Number(req.body.price);
  if (!name || !Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Vui lòng nhập tên món và giá hợp lệ.' });
  const product = { id: makeId('product'), name, category: String(req.body.category || 'Đồ ăn'), price, unit: String(req.body.unit || 'món'), description: String(req.body.description || ''), active: true };
  db.products.push(product); broadcast(); res.json({ product, state: publicState() });
});

app.put('/api/admin/products/:id', auth, adminOnly, (req, res) => {
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
  if (req.body.name !== undefined) product.name = String(req.body.name).trim().slice(0, 120) || product.name;
  if (req.body.price !== undefined) product.price = Math.max(0, Number(req.body.price) || 0);
  if (req.body.category !== undefined) product.category = String(req.body.category);
  if (req.body.unit !== undefined) product.unit = String(req.body.unit);
  if (req.body.description !== undefined) product.description = String(req.body.description).slice(0, 200);
  if (req.body.active !== undefined) product.active = Boolean(req.body.active);
  broadcast(); res.json({ product, state: publicState() });
});

app.delete('/api/admin/products/:id', auth, adminOnly, (req, res) => {
  const product = db.products.find(p => p.id === req.params.id);
  if (product) product.active = false;
  broadcast(); res.json({ state: publicState() });
});

app.post('/api/admin/users', auth, adminOnly, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const displayName = String(req.body.displayName || '').trim();
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Tên đăng nhập cần 3–30 ký tự (chữ, số, dấu . _ -).' });
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu cần tối thiểu 6 ký tự.' });
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại.' });
  const user = { id: makeId('user'), username, displayName: displayName || username, role: req.body.role === 'admin' ? 'admin' : 'staff', passwordHash: makePassword(password), active: true, createdAt: new Date().toISOString() };
  db.users.push(user); broadcast(); res.json({ user: safeUser(user), state: publicState() });
});

app.put('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  if (user.username === 'admin' && req.body.active === false) return res.status(400).json({ error: 'Không thể khóa tài khoản admin mặc định.' });
  if (req.body.displayName !== undefined) user.displayName = String(req.body.displayName).trim().slice(0, 80) || user.displayName;
  if (req.body.role !== undefined && user.username !== 'admin') user.role = req.body.role === 'admin' ? 'admin' : 'staff';
  if (req.body.active !== undefined && user.username !== 'admin') user.active = Boolean(req.body.active);
  if (req.body.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Mật khẩu cần tối thiểu 6 ký tự.' });
    user.passwordHash = makePassword(String(req.body.password));
  }
  broadcast(); res.json({ user: safeUser(user), state: publicState() });
});

app.post('/api/kitchen/:ticketId/status', auth, (req, res) => {
  const ticket = db.kitchenTickets.find(t => t.id === req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Không tìm thấy phiếu bếp.' });
  ticket.status = ['new', 'preparing', 'done'].includes(req.body.status) ? req.body.status : ticket.status;
  ticket.updatedAt = new Date().toISOString();
  broadcast('kitchen:update', { ticket });
  res.json({ ticket, state: publicState() });
});

app.post('/api/admin/cash', auth, adminOnly, (req, res) => {
  const amount = Number(req.body.amount);
  const type = req.body.type === 'expense' ? 'expense' : 'income';
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Số tiền phải lớn hơn 0.' });
  const record = { id: makeId('cash'), type, amount, reason: String(req.body.reason || '').slice(0, 160), createdAt: new Date().toISOString(), createdBy: req.user.displayName || req.user.username };
  db.cashRecords.unshift(record); broadcast(); res.json({ record, state: publicState() });
});

app.post('/api/admin/returns', auth, adminOnly, (req, res) => {
  const receipt = db.receipts.find(r => r.id === req.body.receiptId);
  if (!receipt) return res.status(404).json({ error: 'Không tìm thấy hóa đơn.' });
  const record = { id: makeId('return'), receiptId: receipt.id, receiptNumber: receipt.number, amount: receipt.total, reason: String(req.body.reason || 'Trả hàng'), createdAt: new Date().toISOString(), createdBy: req.user.displayName || req.user.username };
  receipt.status = 'returned';
  db.returnRecords.unshift(record); broadcast(); res.json({ record, state: publicState() });
});

app.put('/api/admin/settings', auth, adminOnly, (req, res) => {
  for (const key of ['storeName', 'branchName', 'address', 'phone']) {
    if (req.body[key] !== undefined) db.settings[key] = String(req.body[key]).slice(0, 160);
  }
  broadcast(); res.json({ settings: db.settings, state: publicState() });
});

app.post('/api/admin/shift', auth, (req, res) => {
  const record = { id: makeId('shift'), action: 'Đổi ca / đổi nguồn', note: String(req.body.note || ''), createdAt: new Date().toISOString(), user: req.user.displayName || req.user.username };
  db.shiftLogs.unshift(record); broadcast(); res.json({ record, state: publicState() });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Có lỗi máy chủ. Vui lòng thử lại.' });
});

server.listen(PORT, HOST, () => {
  console.log('\n🎵 Musicbox POS đã khởi động.');
  console.log(`   Host: ${HOST}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Data: ${DB_FILE}`);
  console.log(`   Health: /api/health\n`);
});

function shutdown(signal) {
  console.log(`${signal}: đang lưu dữ liệu Musicbox...`);
  try { saveDatabase(); } catch (error) { console.error('Không thể lưu dữ liệu khi tắt:', error); }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
