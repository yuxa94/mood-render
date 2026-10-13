import type { Project, Job } from "../shared/contracts.js";
export function buildBrief(p: Project, j: Job) {
  const b = j.snapshot.board;
  const labels: Record<string, string> = {
    camera: "카메라·구도",
    structure: "매스·벽체",
    openings: "창호·개구부",
    furniture: "가구 배치",
  };
  return [
    "원본 3D 이미지를 실사 느낌의 건축 사진으로 편집한다.",
    j.baseResultId
      ? "선택 결과를 수정하되 원본 3D 이미지는 형태 기준으로 유지한다."
      : "원본 3D 이미지가 편집 대상이자 형태 기준이다.",
    `유지 조건: ${
      Object.entries(b.preserve)
        .filter(([, v]) => v)
        .map(([k]) => labels[k])
        .join(", ") || "사용자 지시를 따름"
    }.`,
    `전체 방향: ${b.direction}`,
    `추가 요청: ${j.instruction}`,
    ...b.items.map((item, i) => {
      const r = j.snapshot.references.find((r) => r.id === item.referenceId)!;
      const auto = item.roles.includes("auto");
      const roles = auto
        ? "자동 — 실제 참조 이미지를 보고 재료·조명·색감·조경·가구·분위기 중 적합한 요소와 적용 대상을 판단한다. 전체 방향과 유지 조건을 우선하고 사용자 메모가 있으면 따른다"
        : item.roles.join(", ");
      return `참조 ${i + 1} (${r.title}): 역할=${roles}; 대상=${item.target.trim() || "원본 공간에 맞게 자동 판단"}; 지시=${item.note.trim() || "이미지에서 적합한 특성을 추출"}. 참조의 형태와 카메라는 가져오지 않는다.`;
    }),
    "실제 입력 이미지를 모두 확인하고 내장 이미지 도구만 사용한다. 이미지 수 제한이 있으면 필수 참조를 조용히 누락하지 않는다.",
    "생성 뒤 원본과 비교해 눈에 보이는 형태 변화를 기록한다. 치수 정확도를 보장하지 않는다.",
  ].join("\n");
}
