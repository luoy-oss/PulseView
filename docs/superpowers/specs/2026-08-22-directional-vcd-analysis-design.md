# Directional VCD Analysis Design

## Goal

Add support for VCD captures containing a pulse signal and a separate direction signal, such as `D0` for pulses and `D2` for direction. The feature must preserve existing single-channel and AB-phase workflows while allowing the user to select both source channels and render direction as signed frequency.

## User experience

The upload screen keeps the existing normal-frequency and AB-file entry points. A VCD opened through the multi-channel encoder workflow opens the existing AB-style analysis surface, extended with a decoder mode selector:

- `AB 相`: existing quadrature decoder behavior.
- `脉冲 + 方向`: pulse-source and direction-source selectors, automatic initial selection, direction mapping controls, and signed frequency output.

The directional page shows the selected channels and summary counters. The main chart uses positive frequency for forward motion and negative frequency for reverse motion. Existing zoom, pan, cursor, range selection, CSV export, acceleration analysis, and status-bar behavior remain available.

The direction mapping control provides four presets matching common hardware conventions:

1. Idle high, forward low, reverse high.
2. Idle low, forward low, reverse high.
3. Idle low, forward high, reverse low.
4. Idle high, forward high, reverse low.

An optional custom setting exposes the forward level directly (high or low); the opposite level is reverse, while the idle level is retained as metadata for display and automatic inference. Invalid selections where forward and reverse use the same level are rejected.

## Data flow

The VCD worker's multi-channel parser remains the source of truth for all one-bit `$var` declarations. It returns channel ids, names, transition timestamps, levels, sample count, duration, and estimated sampling rate. Existing normal mode continues to use the D0 channel and existing edge interpretation controls.

The encoder analysis view receives the complete channel list and maintains the selected decoder mode and channel ids locally. Channel changes reset cursors, range state, zoom state, and detected acceleration segments, just as changing A/B currently does.

## Automatic channel selection

When directional mode is selected, the view computes a score for each channel:

- Pulse candidates are favored when they contain frequent alternating transitions and a high count of complete pulse intervals.
- Direction candidates are favored when they have substantially fewer transitions and long stable runs.
- If a channel name contains common pulse hints such as `pulse`, `step`, or `D0`, it receives a small tie-break bonus; names alone never override waveform evidence.

The highest-scoring pulse channel is selected first. The highest-scoring different channel is selected as direction. The user can always override both selections.

## Directional decoding

For the selected pulse channel, complete pulse edges are reconstructed from its transition list. The default decoder uses consecutive equivalent pulse edges to calculate one period and places the frequency point at the midpoint of the period. The pulse level is inferred from the pulse channel's first stable level and can be changed through the existing pulse-level controls if needed.

For each frequency interval, the decoder samples the direction channel at the pulse event that starts the interval, using the latest direction transition at or before that event. This intentionally handles captures where the direction output changes before pulse generation begins. No direction-delay duration is measured or reported.

The selected mapping converts the sampled direction level to a sign:

- forward -> positive frequency;
- reverse -> negative frequency;
- no-output/idle before the first known direction transition -> no directional frequency point until a direction level is available.

Direction changes inside an already measured period do not retroactively change that period; the next period uses the latest direction level at its pulse event.

## Analysis model

Introduce a small pure decoder module for directional data. Its public input is two `AbChannel` values plus decoder options; its output contains signed frequency points, pulse/edge counts, forward and reverse counts, unknown-direction count, and duration-related summary values needed by the existing view.

The existing AB decoder remains behaviorally unchanged. The encoder view selects the appropriate pure decoder based on mode and normalizes both results to the existing chart and analysis-panel contracts. Directional signed points are passed directly to the existing frequency chart, so values below zero naturally render as reverse motion.

## Error handling and edge cases

- A directional analysis requires two distinct one-bit channels. If fewer than two valid channels exist, show a clear parse/selection error and do not enter directional mode.
- If no complete pulse period can be formed, show the channel selection surface with an explanatory empty state instead of fabricating frequency points.
- If the direction channel has no transition before a pulse, use its initial captured level when available; otherwise classify that period as unknown and exclude it from signed frequency counts.
- Channel selectors must prevent choosing the same channel for pulse and direction.
- Existing AB mode and ordinary single-channel imports must continue to produce the same results.

## Verification

Add pure-function tests covering:

- the four mapping presets;
- custom forward-level mapping;
- direction transitions occurring before the first pulse;
- direction transitions between pulse periods;
- signed forward/reverse output and counts;
- unknown direction before the first direction level;
- automatic pulse/direction candidate selection;
- preservation of existing AB decoding tests/behavior.

Build verification must include `npm test` and `npm run build`. A manual browser check should load a representative multi-channel VCD, verify automatic selection of a dense pulse channel and a sparse direction channel, switch all mappings, manually swap channels, and confirm positive/negative chart placement.

## Scope exclusions

This feature does not estimate, display, or compensate for the duration of the direction-output delay. It also does not change non-VCD parsers or introduce a new file format.
