import { useId } from "react";

/** Original paper-cut illustration; decorative, never a substitute for product photography. */
export function WorkshopArt({
  variant = "table",
}: {
  variant?: "table" | "bundle";
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`workshop-art workshop-art-${variant}`}
      viewBox="0 0 620 540"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={`grid-${id}`}
          width="28"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <path d="M28 0H0V28" stroke="#47634D" strokeOpacity=".12" />
        </pattern>
        <pattern
          id={`stripe-${id}`}
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(28)"
        >
          <path d="M0 0V18" stroke="#EC774A" strokeWidth="8" />
        </pattern>
      </defs>
      <path
        d="M94 78C167 19 450 17 529 112C585 180 591 376 506 443C437 500 189 526 104 443C20 361 18 140 94 78Z"
        fill="#DEE8C8"
      />
      <path
        d="M94 78C167 19 450 17 529 112C585 180 591 376 506 443C437 500 189 526 104 443C20 361 18 140 94 78Z"
        fill={`url(#grid-${id})`}
      />
      <g className="art-notebook" transform="rotate(-12 185 310)">
        <rect
          x="73"
          y="222"
          width="216"
          height="238"
          rx="9"
          fill="#284B37"
          opacity=".12"
          transform="translate(7 8)"
        />
        <rect
          x="73"
          y="222"
          width="216"
          height="238"
          rx="9"
          fill="#F6A5B9"
          stroke="#284B37"
          strokeWidth="3"
        />
        <path d="M99 222V460" stroke="#284B37" strokeWidth="3" />
        <path
          d="M78 246H109M78 278H109M78 310H109M78 342H109M78 374H109M78 406H109M78 438H109"
          stroke="#284B37"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <rect
          x="127"
          y="259"
          width="131"
          height="65"
          rx="4"
          fill="#FFF8E8"
          stroke="#284B37"
          strokeWidth="2"
        />
        <path
          d="M148 282H237M148 297H212"
          stroke="#284B37"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M165 385C135 359 152 338 172 343C187 329 214 343 207 362C224 377 210 399 190 394C178 412 151 408 165 385Z"
          fill="#BF4F2E"
        />
        <circle cx="183" cy="371" r="13" fill="#F5D17B" />
      </g>
      <g className="art-tote" transform="rotate(10 380 288)">
        <path
          d="M286 211H473L492 416Q391 449 277 416Z"
          fill="#284B37"
          opacity=".12"
          transform="translate(8 8)"
        />
        <path
          d="M321 226V168C321 97 438 97 438 168V226"
          stroke="#284B37"
          strokeWidth="17"
        />
        <path
          d="M322 225V171C322 105 437 105 437 171V225"
          stroke="#FFF6DC"
          strokeWidth="11"
        />
        <path
          d="M286 211H473L492 416Q391 449 277 416Z"
          fill="#FFF6DC"
          stroke="#284B37"
          strokeWidth="3"
        />
        <path
          d="M302 223L294 405M457 223L475 405"
          stroke="#D5CBB4"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <g transform="translate(379 314)">
          <path
            d="M0-56C15-73 32-48 25-32C47-40 62-19 45-4C65 10 51 34 30 30C28 56 0 62-10 41C-31 55-52 33-39 13C-63 7-59-20-35-26C-41-49-18-65 0-56Z"
            fill="#EB784D"
          />
          <circle cx="4" cy="-5" r="26" fill="#F5D17B" />
          <path
            d="M-5-9V-5M14-9V-5M-6 5Q4 16 16 4"
            stroke="#284B37"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </g>
      <g className="art-cookie" transform="rotate(-15 484 136)">
        <path
          d="M447 74Q479 60 505 81L518 106Q543 133 522 159L494 177Q462 192 441 166L424 134Q417 97 447 74Z"
          fill="#F5CD78"
          stroke="#284B37"
          strokeWidth="3"
        />
        <path
          d="M447 102L458 107L451 118Z M479 87L490 93L487 104Z M500 130L510 139L496 145Z M457 145L469 146L463 157Z"
          fill="#6C4C32"
        />
        <path
          d="M475 119V123M491 115V119M478 132Q486 139 493 128"
          stroke="#284B37"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g className="art-scissors" transform="rotate(-27 155 130)">
        <path
          d="M163 129L229 54Q242 44 234 64L182 143M162 135L215 181Q230 194 225 177L177 126"
          fill="#FFF8E8"
          stroke="#284B37"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="174" cy="132" r="5" fill="#284B37" />
        <ellipse
          cx="137"
          cy="115"
          rx="22"
          ry="16"
          stroke="#BF4F2E"
          strokeWidth="11"
        />
        <ellipse
          cx="142"
          cy="157"
          rx="22"
          ry="16"
          stroke="#BF4F2E"
          strokeWidth="11"
        />
        <path
          d="M154 126L169 132L159 147"
          stroke="#BF4F2E"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>
      <g transform="rotate(16 330 76)">
        <path
          d="M285 61L294 56L302 63L312 56L321 63L333 56L342 63L352 56L363 63L373 56V97L363 102L354 94L343 102L333 94L322 102L312 94L301 102L291 94L285 100Z"
          fill="#F5D17B"
          opacity=".9"
        />
        <path
          d="M298 65H361V92H298Z"
          fill={`url(#stripe-${id})`}
          opacity=".6"
        />
      </g>
      <path
        d="M67 168L78 164M61 189L74 188M558 305L572 312M553 325L567 329M258 475L266 488M277 474L280 489"
        stroke="#BF4F2E"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M519 402L528 384L537 402L556 410L537 418L528 437L519 418L500 410Z"
        fill="#F6A5B9"
        stroke="#284B37"
        strokeWidth="2"
      />
      <path
        d="M88 68L93 56L98 68L110 73L98 78L93 90L88 78L76 73Z"
        fill="#EB784D"
      />
      <path
        d="M179 475Q202 488 229 475M177 486Q205 500 231 486"
        stroke="#284B37"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
