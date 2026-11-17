/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 컴퓨터 이름에 한글이 있으면 Vercel CLI 가 그 이름을 HTTP 헤더에 넣다가
 * "Cannot convert argument to a ByteString ... greater than 255" 오류로 죽는다.
 * 이 파일을 node 에 미리 불러오면(--require) 호스트명을 영문으로 보이게 해 오류를 피한다.
 * 컴퓨터 설정은 바꾸지 않고, 이 명령을 실행하는 동안에만 적용된다.
 *
 * 사용(PowerShell):
 *   $env:NODE_OPTIONS = "--require $PWD\scripts\ascii-hostname.cjs"
 *   npx -y vercel@latest <명령>
 * 끝나면:  Remove-Item Env:NODE_OPTIONS
 */
const os = require("os");

const ascii = (s) => (/^[\x20-\x7e]+$/.test(String(s)) ? String(s) : "pc");
const original = os.hostname.bind(os);
os.hostname = () => ascii(original());

for (const key of ["COMPUTERNAME", "USERDOMAIN", "USERDOMAIN_ROAMINGPROFILE", "LOGONSERVER"]) {
  if (process.env[key] && !/^[\x20-\x7e\\]+$/.test(process.env[key])) process.env[key] = "PC";
}
