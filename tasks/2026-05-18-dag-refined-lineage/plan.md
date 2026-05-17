# DAG Refined Lineage Repair Plan

## Problem to solve

`runDistillDAG` currently refines verified candidates into `acc.results`, but leaves
`acc.candidates` and `acc.qualityReports` aligned to the pre-refine candidate list.
`deliver_to_sinks` then tries to recover alignment by candidate id and finally by
array index. When aggregation merges or reorders assets, audit records and approval
checks can point at a different candidate/quality report than the result delivered
to sinks.

## Target state

The DAG should carry a single internal delivery item per refined asset:

```text
RefinedAsset -> { result, candidate, quality }
```

Sink delivery, approval, audit records, and returned DAG summaries must read from
that structure instead of reconstructing lineage from parallel arrays.

## Boundary

Do:
- keep the existing public `DistillDAGResult` fields for compatibility;
- recompute quality after refinement, because refined assets are the delivery unit;
- remove id/index fallback matching in `deliver_to_sinks`;
- add a regression test where two candidates merge into one refined result.

Do not:
- change sink plugin contracts;
- persist a new refined asset schema in `LocalAssetStore`;
- change aggregator grouping semantics.

## DAG split

```text
A. Capture existing failure in test
   input: two same-topic candidates with different quality/audit identities
   output: failing expectation for one refined audit aligned to the refined result
   failure impact: no production code change
   acceptance: test fails before implementation and passes after

B. Introduce internal DeliveryItem
   input: RefinedAsset[]
   output: DistillResult + AssetCandidate + QualityReport grouped together
   depends: A
   failure impact: DAG result construction fails fast
   acceptance: no parallel-array fallback in sink node

C. Update docs and quality gate
   input: implementation and tests
   output: ledger status, static scan report
   depends: B
   failure impact: task remains incomplete
   acceptance: build, tests, ai completion gate pass
```

## Architecture relationship

This keeps `pipeline` orchestration unchanged and fixes the `distill` DAG boundary
where asset lifecycle state is already modeled. It preserves sink orthogonality:
sinks still receive `DistillResult[]`, while approval and audit use the internally
paired candidate/quality data for the exact delivered refined asset.
