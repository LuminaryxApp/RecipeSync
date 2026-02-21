// Production knexfile — used inside Docker for migrations
// Uses compiled .js migration files from dist/
module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: './dist/db/migrations',
    extension: 'js',
  },
};
