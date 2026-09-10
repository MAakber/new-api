# B04 converter snapshot review

The complete original request/response/stream matrix and its 12 removed fixture files are retained. Upstream narrowed the matrix and omitted stream accounting assertions; that reduction is not adopted.

Candidate generation is not acceptance. Run the matrix without `-update` after committing the reviewed fixtures. The first candidate run failed because the historical Claude fixture used an invalid 512-token thinking budget; the second exposed an unspecified Gemini destination model. The fixture now uses a 1024-token budget, 2048 output limit, and the concrete Gemini 2.5 Pro destination where Gemini thinking capabilities are required.

Reviewed changes:

- Tool call/result IDs now match across Gemini, Claude, Chat and Responses. The Gemini request previously expected an unmatched `call_0` result for a `call_1` call; the generated pair was inspected and is now consistent.
- Gemini-to-Claude retains the original user text and image, which were previously missing from that snapshot.
- Direct Claude-to-Responses omits an empty assistant message while retaining the function call and result. Reasoning follows the explicit valid budget.
- OpenAI-to-Claude retains reasoning text and emits text/tool blocks in order. Its input count excludes separately reported cached input (10 total input minus 3 cached = 7 uncached), as required by Claude usage semantics.
- Claude-to-Gemini preserves the original Claude billing sidecar instead of reconstructing billing from an intermediate OpenAI view.
- Claude streams keep first-frame input usage (4 input plus 2 output = 6); later frames without input counts do not erase it. Gemini stream totals and modality details remain present. Stream billing snapshots remain part of the golden assertion.

The initial JSON-path differences are in `B04-golden-candidate-diff.json`. The final additional Claude-to-Gemini changes preserve call IDs and carry the valid budget/output limit. The complete committed diff remains the authoritative artifact.
