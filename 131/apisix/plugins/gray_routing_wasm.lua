local core = require("apisix.core")
local wasm = require("apisix.plugins.proxy_wasm")

local plugin_name = "gray_routing_wasm"

local schema = {
    type = "object",
    properties = {
        wasm_path = {
            type = "string",
            default = "apisix/wasm/gray_routing_wasm.wasm"
        },
        rules = {
            type = "array",
            items = {
                type = "object",
                properties = {
                    match = {
                        type = "object",
                        properties = {
                            header = { type = "string", default = "x-version" },
                            value = { type = "string" },
                            user_id_header = { type = "string", default = "x-user-id" },
                            percentage = { type = "integer", minimum = 0, maximum = 100 },
                            hash_key = { type = "string" },
                            user_ids = { type = "array", items = { type = "string" } }
                        }
                    },
                    upstream = {
                        type = "object",
                        properties = {
                            type = { type = "string", enum = { "v1", "v2", "canary" }, default = "v1" },
                            nodes = {
                                type = "array",
                                items = {
                                    type = "object",
                                    properties = {
                                        host = { type = "string" },
                                        port = { type = "integer" },
                                        weight = { type = "integer", default = 1 }
                                    },
                                    required = { "host", "port" }
                                }
                            },
                            upstream_id = { type = "string" }
                        }
                    },
                    enabled = { type = "boolean", default = true },
                    priority = { type = "integer", default = 0 }
                }
            }
        },
        default_upstream = {
            type = "object",
            properties = {
                type = { type = "string", enum = { "v1", "v2", "canary" }, default = "v1" },
                nodes = {
                    type = "array",
                    items = {
                        type = "object",
                        properties = {
                            host = { type = "string" },
                            port = { type = "integer" },
                            weight = { type = "integer", default = 1 }
                        },
                        required = { "host", "port" }
                    }
                },
                upstream_id = { type = "string" }
            }
        }
    }
}

local _M = {
    version = 1.0,
    priority = 2500,
    name = plugin_name,
    schema = schema,
}

function _M.check_schema(conf)
    return core.schema.check(schema, conf)
end

function _M.route(ctx)
    local conf = ctx.gray_routing_conf
    if not conf then
        return nil, "no configuration"
    end

    local wasm_conf = {
        wasm_path = conf.wasm_path or "apisix/wasm/gray_routing_wasm.wasm",
        plugin_config = core.json.encode({
            rules = conf.rules or {},
            default_upstream = conf.default_upstream
        })
    }

    local result, err = wasm.on_configure(wasm_conf)
    if err then
        return nil, err
    end

    result, err = wasm.on_http_request_headers(wasm_conf, ctx)
    if err then
        return nil, err
    end

    local upstream_type = ngx.var.http_x_gray_route
    if upstream_type then
        for _, rule in ipairs(conf.rules or {}) do
            if rule.upstream.type == upstream_type then
                return { upstream = rule.upstream }
            end
        end

        if conf.default_upstream and conf.default_upstream.type == upstream_type then
            return { upstream = conf.default_upstream }
        end
    end

    return nil
end

return _M
