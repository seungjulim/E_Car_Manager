import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다. (.env.local 에 Neon 연결 문자열을 넣어 주세요)');
  }
  return drizzle(neon(url), { schema });
}

let cached: ReturnType<typeof createDb> | undefined;

/**
 * 첫 사용 시점에 DB 연결을 만든다(import 만으로는 연결/에러가 생기지 않는다).
 * 그래서 DATABASE_URL 이 없어도 빌드와 화면 개발이 가능하다.
 *
 * Neon HTTP 드라이버는 서버리스(Vercel)에 적합하지만 다중 문장 트랜잭션은 지원하지 않는다.
 * 트랜잭션이 필요해지면 `drizzle-orm/neon-serverless` + `Pool` 로 교체한다.
 */
export function getDb() {
  return (cached ??= createDb());
}

export { schema };
