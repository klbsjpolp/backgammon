export const Checkbox = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) => (
  <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-emerald-200/70">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 accent-amber-500"
    />
    {children}
  </label>
);
