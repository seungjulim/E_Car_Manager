"use client";

/** 폼 안에서 쓰는 삭제 버튼: 누르면 한 번 더 확인한다 */
export function DeleteDocumentButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm("이 서류와 사진을 삭제할까요? 연결된 정비 기록은 남아요.")) e.preventDefault();
      }}
      className="min-h-9 rounded-lg border border-line px-3 text-xs text-bad"
    >
      서류 삭제
    </button>
  );
}
