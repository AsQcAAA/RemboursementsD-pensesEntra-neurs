// Blason monogramme simple aux couleurs du club (noir/or), pour éviter de
// reproduire le logo officiel protégé de l'organisation.
// Identique à src/components/Crest.tsx de l'appli M17 (as-quebec-m17), pour
// que les deux sites soient visiblement de la même famille.
export default function Crest({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 56" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M24 1 L46 9 V27 C46 40 37 50 24 55 C11 50 2 40 2 27 V9 Z"
        fill="#0d0c0c"
        stroke="#fdca37"
        strokeWidth="2"
      />
      <path
        d="M24 6 L41 12.5 V27 C41 37.5 34 45.5 24 49.5 C14 45.5 7 37.5 7 27 V12.5 Z"
        fill="none"
        stroke="#fdca37"
        strokeWidth="1"
        opacity="0.5"
      />
      <text
        x="24"
        y="34"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="bold"
        fontSize="22"
        fill="#fdca37"
      >
        AS
      </text>
    </svg>
  );
}
