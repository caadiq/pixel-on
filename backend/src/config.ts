import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 누락`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  db: {
    host: process.env.DB_HOST ?? 'mariadb',
    port: Number(process.env.DB_PORT ?? 3306),
    name: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
  },
  /** JWT 서명 시크릿 */
  jwtSecret: process.env.JWT_SECRET ?? '',
} as const;
