export default function DispatchPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">업무배분실</h1>
      <p className="text-sm opacity-70">
        애매한 업무를 넣으면 쟁점을 나누고, 사무분장·사례·근거로 부서별 점수를 계산해 판정서를 냅니다.
        점수 차가 10점 미만이거나 직접 근거가 없으면 &lsquo;검토 필요&rsquo;로 표시합니다. (3단계에서 구현)
      </p>
    </div>
  );
}
