-- CreateIndex
CREATE INDEX "Span_traceId_startTime_idx" ON "Span"("traceId", "startTime");

-- CreateIndex
CREATE INDEX "Trace_projectId_timestamp_idx" ON "Trace"("projectId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "Trace_projectId_id_idx" ON "Trace"("projectId", "id");
