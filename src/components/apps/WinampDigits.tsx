const DIGITS = '0123456789';
const DIGIT_WIDTH = 9;
const DIGIT_HEIGHT = 13;

export default function WinampDigits({
  value,
  scale = 1,
  className = '',
}: {
  value: string;
  scale?: number;
  className?: string;
}) {
  return (
    <span
      class={`wa-digits ${className}`}
      aria-label={value}
      style={{ height: `${DIGIT_HEIGHT * scale}px` }}
    >
      {[...value].map((character, index) => {
        const digit = DIGITS.indexOf(character);
        if (digit < 0) {
          return (
            <span
              key={`${character}-${index}`}
              class="wa-digit-separator"
              style={{ width: `${4 * scale}px`, fontSize: `${11 * scale}px` }}
            >
              {character}
            </span>
          );
        }
        return (
          <i
            key={`${character}-${index}`}
            class="wa-digit"
            style={{
              width: `${DIGIT_WIDTH * scale}px`,
              height: `${DIGIT_HEIGHT * scale}px`,
              backgroundSize: `${99 * scale}px ${13 * scale}px`,
              backgroundPosition: `${-digit * DIGIT_WIDTH * scale}px 0`,
            }}
          />
        );
      })}
    </span>
  );
}
