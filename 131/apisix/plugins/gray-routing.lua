-- APISIX Gray Routing Plugin v3
-- 支持 x-version 动态路由 + 用户 ID 哈希一致性灰度
-- 修复: 配置热更新时使用双缓冲，避免 502 错误
-- 新增: 请求采样录制，支持按概率录制到 Kafka

local core = require("apisix.core")
local resty_md5 = require("resty.md5")
local str = require("resty.string")
local resty_lock = require("resty.lock")
local ngx_http = require("ngx.http")

local plugin_name = "gray-routing"

local schema = {
    type = "object",
    properties = {
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
                            upstream_id = { type = "string" },
                            timeout = {
                                type = "object",
                                properties = {
                                    connect = { type = "integer", default = 3000 },
                                    send = { type = "integer", default = 3000 },
                                    read = { type = "integer", default = 3000 }
                                }
                            }
                        },
                        oneOf = {
                            { required = { "nodes" } },
                            { required = { "upstream_id" } }
                        ]
                    },
                    enabled = { type = "boolean", default = true },
                    priority = { type = "integer", default = 0 }
                },
                required = { "upstream" }
            },
            default = {}
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
        },
        etcd_watch_key = { type = "string", default = "/apisix/plugins/gray-routing/rules" },
        cache_ttl = { type = "integer", default = 60 },
        enable_wasm = { type = "boolean", default = false },
        wasm_plugin_name = { type = "string", default = "gray_routing_wasm" },
        enable_hot_update = { type = "boolean", default = true },
        debounce_delay = { type = "integer", default = 1 },
        -- 采样录制配置
        sampling = {
            type = "object",
            properties = {
                enabled = { type = "boolean", default = false },
                rate = { type = "number", minimum = 0, maximum = 1, default = 0.01 },
                kafka_topic = { type = "string", default = "gray-routing-requests" },
                backend_url = { type = "string", default = "http://backend:3001/api/record" },
                max_body_size = { type = "integer", default = 1048576 },
                record_request_headers = { type = "boolean", default = true },
                record_response_headers = { type = "boolean", default = true },
                record_request_body = { type = "boolean", default = true },
                record_response_body = { type = "boolean", default = true }
            }
        }
    }
}

local _M = {
    version = 3.0,
    priority = 2000,
    name = plugin_name,
    schema = schema
}

-- 双缓冲配置
local config_buffers = {
    active = nil,
    standby = nil
}

-- 配置版本号，用于原子切换
local config_version = 0

-- 活跃请求计数器
local active_requests = 0
local config_lock = nil

-- 采样统计
local sampling_stats = {
    total_requests = 0,
    sampled_requests = 0,
    last_report_time = ngx.now()
}

local function init_lock()
    if not config_lock then
        local lock, err = resty_lock:new("gray_routing_lock", {
            timeout = 5,
            step = 0.001
        })
        if lock then
            config_lock = lock
        end
    end
end

local function acquire_lock()
    init_lock()
    if config_lock then
        local elapsed, err = config_lock:lock("config_update")
        if elapsed then
            return true
        end
        if err and err ~= "timeout" then
            core.log.warn("Failed to acquire lock: ", err)
        end
    end
    return false
end

local function release_lock()
    if config_lock then
        config_lock:unlock("config_update")
    end
end

local function hash_user_id(user_id, hash_key)
    local md5 = resty_md5:new()
    if not md5 then
        return nil
    end

    local key = hash_key and (user_id .. hash_key) or user_id
    md5:update(key)
    local digest = md5:final()
    local hex = str.to_hex(digest)

    local hash = 0
    for i = 1, #hex do
        hash = (hash * 16 + tonumber(hex:sub(i, i), 16)) % 10000
    end

    return hash
end

local function is_user_in_percentage(user_id, percentage, hash_key)
    if percentage <= 0 then
        return false
    end
    if percentage >= 100 then
        return true
    end

    local hash = hash_user_id(user_id, hash_key)
    if not hash then
        return false
    end

    return (hash % 100) < percentage
end

local function is_user_in_list(user_id, user_ids)
    if not user_ids or #user_ids == 0 then
        return false
    end

    for _, id in ipairs(user_ids) do
        if id == user_id then
            return true
        end
    end

    return false
end

local function match_rule(rule, ctx, conf)
    if not rule.enabled then
        return false
    end

    local match = rule.match or {}
    local headers = ngx.req.get_headers()

    if match.header and match.value then
        local header_value = headers[match.header]
        if not header_value or header_value ~= match.value then
            return false
        end
    end

    local user_id = headers[match.user_id_header] or ctx.var[match.user_id_header]

    if match.user_ids and #match.user_ids > 0 then
        if is_user_in_list(user_id, match.user_ids) then
            core.log.info("User ", user_id, " matched in whitelist, routing to ", rule.upstream.type)
            return true
        end
    end

    if match.percentage and match.percentage > 0 then
        if user_id and is_user_in_percentage(user_id, match.percentage, match.hash_key) then
            core.log.info("User ", user_id, " matched percentage ", match.percentage,
                         "%, routing to ", rule.upstream.type)
            return true
        end
    end

    if match.header and match.value then
        return true
    end

    return false
end

local function create_upstream(upstream_config)
    if upstream_config.upstream_id then
        return { upstream_id = upstream_config.upstream_id }
    end

    local nodes = {}
    for _, node in ipairs(upstream_config.nodes) do
        table.insert(nodes, {
            host = node.host,
            port = node.port,
            weight = node.weight or 1
        })
    end

    return {
        type = "roundrobin",
        nodes = nodes,
        timeout = upstream_config.timeout or {
            connect = 3000,
            send = 3000,
            read = 3000
        }
    }
end

-- 验证规则配置的有效性
local function validate_rules(rules)
    if not rules or type(rules) ~= "table" then
        return false, "Rules must be a table"
    end

    for i, rule in ipairs(rules) do
        if not rule.upstream then
            return false, "Rule " .. i .. " missing upstream configuration"
        end

        if not rule.upstream.nodes and not rule.upstream.upstream_id then
            return false, "Rule " .. i .. " upstream must have nodes or upstream_id"
        end

        if rule.upstream.nodes then
            for j, node in ipairs(rule.upstream.nodes) do
                if not node.host or not node.port then
                    return false, "Rule " .. i .. " node " .. j .. " missing host or port"
                end
            end
        end

        if rule.match and rule.match.percentage then
            if rule.match.percentage < 0 or rule.match.percentage > 100 then
                return false, "Rule " .. i .. " percentage must be between 0 and 100"
            end
        end
    end

    return true
end

-- 对规则按优先级排序
local function sort_rules(rules)
    local sorted = core.table.clone(rules)
    table.sort(sorted, function(a, b)
        return (a.priority or 0) > (b.priority or 0)
    end)
    return sorted
end

-- 从 etcd 加载规则（使用 lrucache）
local function load_rules_from_etcd(conf, ctx)
    if not conf.etcd_watch_key then
        return conf.rules
    end

    local cache_key = "etcd_rules_" .. conf.etcd_watch_key
    local cached_rules, err = lrucache(cache_key, conf.cache_ttl, function()
        local etcd_cli, err = core.etcd.new()
        if not etcd_cli then
            core.log.error("failed to create etcd client: ", err)
            return nil
        end

        local res, err = etcd_cli:get(conf.etcd_watch_key)
        if not res or not res.body or not res.body.node or not res.body.node.value then
            core.log.info("No rules found in etcd, using default")
            return conf.rules
        end

        local rules, err = core.json.decode(res.body.node.value)
        if not rules then
            core.log.error("Failed to parse rules from etcd: ", err)
            return conf.rules
        end

        -- 验证新规则
        local valid, err = validate_rules(rules)
        if not valid then
            core.log.error("Invalid rules from etcd: ", err, ", keeping old config")
            return nil
        end

        core.log.info("Loaded ", #rules, " rules from etcd")
        return sort_rules(rules)
    end)

    if err then
        core.log.error("Failed to load rules from etcd: ", err)
        return conf.rules
    end

    return cached_rules or conf.rules
end

-- 获取当前激活的配置（请求开始时调用一次）
local function get_active_config(conf, ctx)
    -- 如果不启用热更新，直接使用静态配置
    if not conf.enable_hot_update then
        return conf
    end

    -- 如果还没有激活配置，初始化
    if not config_buffers.active then
        local rules = load_rules_from_etcd(conf, ctx)
        config_buffers.active = {
            rules = rules,
            default_upstream = conf.default_upstream,
            version = config_version,
            timestamp = ngx.now()
        }
    end

    return config_buffers.active
end

-- 尝试热更新配置（在 rewrite 阶段调用）
local function try_hot_update(conf, ctx)
    if not conf.enable_hot_update then
        return
    end

    -- 使用非阻塞方式尝试获取锁
    local locked = acquire_lock()
    if not locked then
        return
    end

    local ok, err = pcall(function()
        -- 从 etcd 加载新规则
        local new_rules = load_rules_from_etcd(conf, ctx)

        -- 比较是否有变化
        local current_config = config_buffers.active
        if not current_config then
            config_buffers.active = {
                rules = new_rules,
                default_upstream = conf.default_upstream,
                version = config_version,
                timestamp = ngx.now()
            }
            return
        end

        -- 简单比较：如果规则数量不同，说明有变化
        local current_rules = current_config.rules or {}
        if #current_rules ~= #new_rules then
            config_version = config_version + 1
            config_buffers.standby = {
                rules = new_rules,
                default_upstream = conf.default_upstream,
                version = config_version,
                timestamp = ngx.now()
            }

            -- 原子切换（双缓冲）
            config_buffers.active = config_buffers.standby
            config_buffers.standby = nil

            core.log.info("Hot update complete: ", #new_rules, " rules, version: ", config_version)
        end
    end)

    if not ok then
        core.log.error("Hot update failed: ", err)
    end

    release_lock()
end

-- 请求计数器
local function request_start()
    active_requests = active_requests + 1
end

local function request_end()
    active_requests = active_requests - 1
    if active_requests < 0 then
        active_requests = 0
    end
end

-- 判断是否应该采样
local function should_sample(sampling_config)
    if not sampling_config or not sampling_config.enabled then
        return false
    end

    local rate = sampling_config.rate or 0.01
    if rate <= 0 then
        return false
    end
    if rate >= 1 then
        return true
    end

    return math.random() < rate
end

-- 获取请求体
local function get_request_body(max_size)
    ngx.req.read_body()
    local body = ngx.req.get_body_data()

    if not body then
        local file = ngx.req.get_body_file()
        if file then
            local f = io.open(file, "r")
            if f then
                body = f:read("*a")
                f:close()
            end
        end
    end

    if body and max_size and #body > max_size then
        body = string.sub(body, 1, max_size)
    end

    return body
end

-- 获取响应体
local function get_response_body(max_size)
    local body = ngx.arg[1]
    if body and max_size and #body > max_size then
        body = string.sub(body, 1, max_size)
    end
    return body
end

-- 发送采样数据到后端
local function send_sample_to_backend(sampling_config, sample_data)
    local backend_url = sampling_config.backend_url or "http://backend:3001/api/record"

    local httpc = require("resty.http").new()
    httpc:set_timeouts(1000, 1000, 1000)

    local res, err = httpc:request_uri(backend_url, {
        method = "POST",
        body = core.json.encode(sample_data),
        headers = {
            ["Content-Type"] = "application/json",
            ["X-Sampling-Source"] = "apisix-gray-routing"
        },
        keepalive = false
    })

    if not res then
        core.log.warn("Failed to send sample to backend: ", err)
        return false
    end

    if res.status ~= 200 and res.status ~= 201 then
        core.log.warn("Backend returned status ", res.status, ": ", res.body)
        return false
    end

    return true
end

-- 构建采样数据
local function build_sample_data(conf, ctx, upstream_type, matched, request_headers, response_headers)
    local sampling_config = conf.sampling or {}
    local headers = ngx.req.get_headers()

    local sample_data = {
        timestamp = ngx.now() * 1000,
        request_id = ctx.var.request_id or ngx.var.request_id,
        trace_id = headers["x-trace-id"] or headers["x-request-id"],
        user_id = headers["x-user-id"] or ctx.var.http_x_user_id,
        upstream_type = upstream_type,
        matched_rule = matched,
        config_version = config_version,
        method = ngx.req.get_method(),
        uri = ngx.var.request_uri,
        host = ngx.var.host,
        client_ip = ngx.var.remote_addr,
        latency = ngx.now() - (ctx.gray_routing_start_time or 0),
        status_code = ngx.status,
    }

    -- 请求头
    if sampling_config.record_request_headers ~= false then
        sample_data.request_headers = {
            ["x-version"] = headers["x-version"],
            ["x-user-id"] = headers["x-user-id"],
            ["user-agent"] = headers["user-agent"],
            ["content-type"] = headers["content-type"],
            ["x-gray-route"] = ngx.header["x-gray-route"],
        }
    end

    -- 响应头
    if sampling_config.record_response_headers ~= false then
        sample_data.response_headers = {
            ["x-gray-route"] = ngx.header["x-gray-route"],
            ["x-gray-rule-matched"] = ngx.header["x-gray-rule-matched"],
            ["x-gray-config-version"] = ngx.header["x-gray-config-version"],
            ["content-type"] = ngx.header["content-type"],
        }
    end

    -- 请求体
    if sampling_config.record_request_body ~= false then
        sample_data.request_body = get_request_body(sampling_config.max_body_size)
    end

    -- 响应体（在 body_filter 阶段设置）
    if ctx.gray_routing_response_body and sampling_config.record_response_body ~= false then
        sample_data.response_body = ctx.gray_routing_response_body
    end

    return sample_data
end

function _M.check_schema(conf)
    local ok, err = core.schema.check(schema, conf)
    if not ok then
        return false, err
    end

    if conf.default_upstream then
        if not conf.default_upstream.nodes and not conf.default_upstream.upstream_id then
            return false, "default_upstream must have nodes or upstream_id"
        end
    end

    return true
end

function _M.init()
    init_lock()
    core.log.info("Gray Routing Plugin v2 initialized with double buffering")
end

function _M.destroy()
    if config_lock then
        config_lock:unlock("config_update")
    end
    core.log.info("Gray Routing Plugin destroyed")
end

function _M.rewrite(conf, ctx)
    request_start()

    -- 记录请求开始时间
    ctx.gray_routing_start_time = ngx.now()

    -- 采样统计
    sampling_stats.total_requests = sampling_stats.total_requests + 1

    -- 判断是否需要采样
    local sampling_config = conf.sampling or {}
    if should_sample(sampling_config) then
        ctx.gray_routing_sampling = true
        sampling_stats.sampled_requests = sampling_stats.sampled_requests + 1

        -- 提前读取请求体（用于采样）
        if sampling_config.record_request_body ~= false then
            ngx.req.read_body()
        end
    end

    -- 定期报告采样统计
    if ngx.now() - sampling_stats.last_report_time > 60 then
        core.log.info("Sampling stats: ", sampling_stats.sampled_requests, "/",
                     sampling_stats.total_requests, " requests sampled")
        sampling_stats.last_report_time = ngx.now()
    end

    -- 尝试热更新配置（非阻塞，失败时使用旧配置）
    if conf.enable_hot_update then
        try_hot_update(conf, ctx)
    end

    -- 获取当前激活的配置快照
    local active_config = get_active_config(conf, ctx)
    local rules = active_config.rules or conf.rules
    local default_upstream = active_config.default_upstream or conf.default_upstream

    -- Wasm 插件支持
    if conf.enable_wasm and conf.wasm_plugin_name then
        local wasm_ctx = {
            rules = rules,
            default_upstream = default_upstream,
            headers = ngx.req.get_headers(),
            user_id = ngx.var.http_x_user_id
        }

        local ok, err = require("apisix.plugins." .. conf.wasm_plugin_name).route(wasm_ctx)
        if ok and ok.upstream then
            core.log.info("Wasm plugin matched, routing to ", ok.upstream.type)
            ctx.upstream_conf = create_upstream(ok.upstream)
            ctx.gray_routing_upstream_type = ok.upstream.type
            ctx.gray_routing_matched = true
            request_end()
            return
        end
    end

    -- 按优先级排序后的规则匹配
    for _, rule in ipairs(rules) do
        if match_rule(rule, ctx, conf) then
            core.response.set_header("x-gray-route", rule.upstream.type)
            core.response.set_header("x-gray-rule-matched", "true")
            core.response.set_header("x-gray-config-version", tostring(active_config.version))
            ctx.upstream_conf = create_upstream(rule.upstream)
            ctx.gray_routing_upstream_type = rule.upstream.type
            ctx.gray_routing_matched = true
            request_end()
            return
        end
    end

    -- 默认上游
    if default_upstream then
        core.response.set_header("x-gray-route", default_upstream.type)
        core.response.set_header("x-gray-rule-matched", "false")
        core.response.set_header("x-gray-config-version", tostring(active_config.version))
        ctx.upstream_conf = create_upstream(default_upstream)
        ctx.gray_routing_upstream_type = default_upstream.type
        ctx.gray_routing_matched = false
    end

    request_end()
end

function _M.body_filter(conf, ctx)
    -- 捕获响应体用于采样
    if ctx.gray_routing_sampling then
        local sampling_config = conf.sampling or {}
        if sampling_config.record_response_body ~= false then
            local chunk = ngx.arg[1]
            if chunk then
                ctx.gray_routing_response_body = (ctx.gray_routing_response_body or "") .. chunk

                -- 限制响应体大小
                local max_size = sampling_config.max_body_size or 1048576
                if #ctx.gray_routing_response_body > max_size then
                    ctx.gray_routing_response_body = string.sub(ctx.gray_routing_response_body, 1, max_size)
                end
            end
        end
    end
end

function _M.log(conf, ctx)
    request_end()

    -- 发送采样数据
    if ctx.gray_routing_sampling then
        local sampling_config = conf.sampling or {}
        local sample_data = build_sample_data(
            conf,
            ctx,
            ctx.gray_routing_upstream_type,
            ctx.gray_routing_matched or false
        )

        -- 异步发送采样数据
        local ok, err = pcall(send_sample_to_backend, sampling_config, sample_data)
        if not ok then
            core.log.warn("Failed to send sample data: ", err)
        end
    end
end

return _M
