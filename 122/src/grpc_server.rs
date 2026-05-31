use crate::sampler::{Sampler, SamplingDecision};
use crate::sampling::sampling_service_server::SamplingService;
use crate::sampling::{
    BatchShouldSampleRequest, BatchShouldSampleResponse, SampleDecision, ShouldSampleRequest,
    ShouldSampleResponse,
};
use std::sync::Arc;
use tracing::{debug, instrument};

pub struct SamplingServiceImpl {
    sampler: Arc<Sampler>,
}

impl SamplingServiceImpl {
    pub fn new(sampler: Arc<Sampler>) -> Self {
        SamplingServiceImpl { sampler }
    }

    fn convert_decision(decision: SamplingDecision) -> SampleDecision {
        match decision {
            SamplingDecision::Drop => SampleDecision::Drop,
            SamplingDecision::RecordAndSample => SampleDecision::RecordAndSample,
            SamplingDecision::RecordOnly => SampleDecision::RecordOnly,
        }
    }
}

#[tonic::async_trait]
impl SamplingService for SamplingServiceImpl {
    #[instrument(skip(self, request), fields(trace_id = %request.get_ref().trace_id))]
    async fn should_sample(
        &self,
        request: tonic::Request<ShouldSampleRequest>,
    ) -> Result<tonic::Response<ShouldSampleResponse>, tonic::Status> {
        let req = request.into_inner();
        let trace_id = &req.trace_id;
        let parent_sampled = req.parent_sampled;
        let has_parent = !req.parent_span_id.is_empty();
        let is_remote_parent = !req.trace_state.is_empty();

        debug!(
            "处理采样请求: trace_id={}, parent_sampled={}, has_parent={}",
            trace_id, parent_sampled, has_parent
        );

        let (decision, rate, strategy) =
            self.sampler
                .should_sample(trace_id, parent_sampled, has_parent, is_remote_parent);

        let response = ShouldSampleResponse {
            decision: Self::convert_decision(decision) as i32,
            sample_rate: rate,
            strategy: strategy.to_string(),
        };

        Ok(tonic::Response::new(response))
    }

    #[instrument(skip(self, request), fields(batch_size = %request.get_ref().requests.len()))]
    async fn batch_should_sample(
        &self,
        request: tonic::Request<BatchShouldSampleRequest>,
    ) -> Result<tonic::Response<BatchShouldSampleResponse>, tonic::Status> {
        let req = request.into_inner();
        let mut responses = Vec::with_capacity(req.requests.len());

        for req in &req.requests {
            let trace_id = &req.trace_id;
            let parent_sampled = req.parent_sampled;
            let has_parent = !req.parent_span_id.is_empty();
            let is_remote_parent = !req.trace_state.is_empty();

            let (decision, rate, strategy) =
                self.sampler
                    .should_sample(trace_id, parent_sampled, has_parent, is_remote_parent);

            responses.push(ShouldSampleResponse {
                decision: Self::convert_decision(decision) as i32,
                sample_rate: rate,
                strategy: strategy.to_string(),
            });
        }

        Ok(tonic::Response::new(BatchShouldSampleResponse {
            responses,
        }))
    }
}
