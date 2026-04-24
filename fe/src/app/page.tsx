import LtmesRxLogsAdmin from '@/components/ltmes/LtmesRxLogsAdmin'

// 배포 후 청크 해시가 바뀌어도 HTML이 s-maxage로 오래 캐시되면 ChunkLoadError/로그인 불가 발생 방지
export const dynamic = 'force-dynamic'

export default function Home() {
  return <LtmesRxLogsAdmin />
}
