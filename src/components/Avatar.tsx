/** 字母头像：未收录品牌图标时的中性回退，不加载任何网络图标。 */

interface Props {
  name: string;
  size?: number;
}

export function Avatar({ name, size = 40 }: Props) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <div
      className="grid shrink-0 place-items-center rounded-md bg-muted font-semibold text-muted-foreground"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
      }}
      aria-hidden
    >
      {letter}
    </div>
  );
}
