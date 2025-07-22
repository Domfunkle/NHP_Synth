set(SOURCES
    main.c
)

idf_component_register(SRCS ${SOURCES}
                    INCLUDE_DIRS "../include" 
                    REQUIRES driver freertos esp_timer )
