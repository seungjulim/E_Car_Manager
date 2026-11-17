"use client";

import { deleteVehicleAction } from "@/app/cars/(tabs)/actions";

export function DeleteVehicleButton({ id, label }: { id: string; label: string }) {
  return (
    <form
      action={deleteVehicleAction}
      onSubmit={(e) => {
        if (!window.confirm(`'${label}'을(를) 삭제할까요?\n목록에서 사라지고, 같은 차량번호로 다시 등록할 수 있어요.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="min-h-11 w-full rounded-xl border border-line text-sm font-semibold text-bad">
        차량 삭제
      </button>
    </form>
  );
}
