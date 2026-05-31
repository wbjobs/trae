package com.reconciliation.flink;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.reconciliation.model.OrderEvent;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.common.typeinfo.TypeHint;
import org.apache.flink.connector.pulsar.source.reader.deserializer.PulsarDeserializationSchema;
import org.apache.pulsar.client.api.Message;
import org.apache.pulsar.client.api.MessageId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;

public class OrderEventPulsarDeserializationSchema
        implements PulsarDeserializationSchema<OrderEvent> {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(OrderEventPulsarDeserializationSchema.class);

    private static final ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    private final String source;

    public OrderEventPulsarDeserializationSchema(String source) {
        this.source = source;
    }

    @Override
    public OrderEvent deserialize(Message<byte[]> message) throws IOException {
        byte[] value = message.getValue();
        if (value == null || value.length == 0) {
            return null;
        }

        try {
            OrderEvent event = objectMapper.readValue(value, OrderEvent.class);
            event.setSource(source);
            event.setMessageId(message.getMessageId().toString());
            return event;
        } catch (Exception e) {
            LOG.error("Failed to deserialize Pulsar message, topic={}, messageId={}",
                    message.getTopicName(), message.getMessageId(), e);
            return null;
        }
    }

    @Override
    public TypeInformation<OrderEvent> getProducedType() {
        return TypeInformation.of(new TypeHint<OrderEvent>() {});
    }
}
