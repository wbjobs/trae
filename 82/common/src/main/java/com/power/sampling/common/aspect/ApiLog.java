package com.power.sampling.common.aspect;

import java.lang.annotation.*;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ApiLog {

    String serviceName() default "";

    int logLevel() default 1;

    boolean logParams() default true;

    boolean logResult() default false;
}
