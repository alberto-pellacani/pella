// Repository in memoria con lo stesso contratto di src/db/prismaUserRepo.js
function createFakeUserRepo() {
  const users = [];
  let nextId = 1;
  const clone = (u) => (u ? { ...u } : null);
  return {
    async count() { return users.length; },
    async countActiveAdmins() { return users.filter((u) => u.role === 'admin' && u.active).length; },
    async findById(id) { return clone(users.find((u) => u.id === Number(id))); },
    async findByEmail(email) { return clone(users.find((u) => u.email === email)); },
    async findByGoogleId(googleId) { return clone(users.find((u) => u.googleId === googleId)); },
    async create(data) {
      const user = { passwordHash: null, googleId: null, role: 'user', active: true, createdAt: new Date(Date.now() + nextId), ...data, id: nextId++ };
      users.push(user);
      return clone(user);
    },
    async update(id, data) {
      const user = users.find((u) => u.id === Number(id));
      Object.assign(user, data);
      return clone(user);
    },
    async list() { return users.map(clone).sort((a, b) => a.createdAt - b.createdAt); },
  };
}
module.exports = { createFakeUserRepo };
