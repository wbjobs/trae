package storage

func deepCopyMap(src map[string]interface{}) map[string]interface{} {
	if src == nil {
		return nil
	}
	dst := make(map[string]interface{}, len(src))
	for k, v := range src {
		dst[k] = deepCopyValue(v)
	}
	return dst
}

func deepCopyValue(v interface{}) interface{} {
	switch val := v.(type) {
	case map[string]interface{}:
		return deepCopyMap(val)
	case []interface{}:
		return deepCopySlice(val)
	default:
		return val
	}
}

func deepCopySlice(src []interface{}) []interface{} {
	if src == nil {
		return nil
	}
	dst := make([]interface{}, len(src))
	for i, v := range src {
		dst[i] = deepCopyValue(v)
	}
	return dst
}

func deepCopyEventPayload(src map[string]interface{}) map[string]interface{} {
	return deepCopyMap(src)
}
