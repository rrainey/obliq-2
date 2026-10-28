# obliq-2: notes for coding agents

## Documentation style: ASD-STE100

Write all documents to conform to ASD-STE100 Simplified Technical English as far as is practical. This applies to Markdown docs, the CHANGELOG, READMEs, hand-off briefs, test plans and descriptions in models, and to user-facing text in the UI. It does not apply to code identifiers or to quoted source text.

In practice:
- **Sentence length:** procedural sentences (instructions) 20 words or fewer; descriptive sentences 25 words or fewer. Use one instruction per sentence.
- **Paragraphs:** one topic per paragraph, six sentences or fewer.
- **Voice and mood:** use the active voice. Write instructions in the imperative ("Run the export", not "The export should be run").
- **Vocabulary:** use the STE approved words in their approved meanings, with one meaning for each word ("use", not "utilize"; "start", not "commence"). Use the same term for the same thing everywhere.
- **Technical names and verbs** are permitted where STE has no approved word: block types, signal and port names, units, file paths, Betaflight parameter names and mode names. Put code terms in backticks.
- **Avoid:** phrasal verbs, "-ing" forms used as nouns or adjectives where a simpler form exists, long noun clusters (more than three nouns), and vague words ("etc.", "various", "appropriate").
- **Lists:** use vertical lists for steps and for more than three items. Put warnings and conditions before the instruction they apply to.

"As practical" means: do not change established names in the code or the model, and do not rewrite a sentence so that it becomes less exact. When STE and precision conflict, keep the precision.

## Engineering models: units in names

In engineering models that you create or change, put a unit suffix on the name of each signal that has physical units, and on each block that holds a continuous state. Signals include input and output port names, sheet labels and signal names. Blocks with continuous states include integrators, transfer functions and state-space blocks. Examples: `altitude_m`, `pitch_rad`, `heading_deg`, `case_temp_degK`.

Use these suffixes:

| Unit | Suffix | Unit | Suffix |
|---|---|---|---|
| metre | `_m` | metre per second | `_mps` |
| centimetre | `_cm` | metre per second squared | `_mps2` |
| kilometre | `_km` | radian per second | `_radps` |
| radian | `_rad` | degree per second | `_dps` |
| degree (angle) | `_deg` | newton | `_N` |
| kelvin | `_degK` | newton metre | `_Nm` |
| degree Celsius | `_degC` | pascal | `_Pa` |
| second | `_s` | volt, ampere, watt | `_V`, `_A`, `_W` |
| millisecond | `_msec` | milliampere hour | `_mAh` |
| kilogram | `_kg` | hertz | `_Hz` |
| microsecond | `_us` | percent | `_pct` |

Rules:
- Each suffix has one meaning. Do not use `_ms`: it can mean milliseconds or metres per second.
- For a unit that is not in the table, make a suffix from its SI symbols, and add it to this table.
- For a vector, the suffix applies to all elements (`vel_ned_mps`). The elements must have the same unit.
- Flags, counts, codes and dimensionless ratios have no suffix.
- Do not rename the ports of an existing model that other code uses (for example, the FPV Vehicle's ports, which the obliq-fpv-unity host reads by name) unless the user agrees. A rename breaks the hosts that embed the model.
