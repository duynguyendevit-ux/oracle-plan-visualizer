export const LOG_ANALYZER_SAMPLE = `2026-09-10T09:15:28.540Z ERROR 4210 --- [nio-8080-exec-3] c.e.users.UserProfileService : Update failed traceId=trace-user-1042 requestId=req-981
java.lang.IllegalStateException: Unable to update user profile
\tat c.e.users.UserProfileService.update(UserProfileService.java:84)
Caused by: java.sql.SQLSyntaxErrorException: ORA-00904: "U1_0"."DISPLAY_NAMEE": invalid identifier
\tat oracle.jdbc.driver.T4CTTIoer.processError(T4CTTIoer.java:450)
2026-09-10T09:15:29.120Z WARN  4210 --- [nio-8080-exec-4] c.e.users.UserProfileService : Falling back to username traceId=trace-user-1043 requestId=req-982
2026-09-10T09:15:30.010Z ERROR 4210 --- [nio-8080-exec-5] c.e.users.UserProfileService : Update failed traceId=trace-user-1044 requestId=req-983
java.lang.IllegalStateException: Unable to update user profile
\tat c.e.users.UserProfileService.update(UserProfileService.java:84)
Caused by: java.sql.SQLSyntaxErrorException: ORA-00904: "U1_0"."DISPLAY_NAMEE": invalid identifier
\tat oracle.jdbc.driver.T4CTTIoer.processError(T4CTTIoer.java:450)
2026-09-10T09:15:31.542Z INFO  4210 --- [nio-8080-exec-6] c.e.users.UserProfileService : Profile loaded traceId=trace-user-1045 requestId=req-984
2026-09-10T09:15:31.550Z DEBUG 4210 --- [nio-8080-exec-6] o.h.SQL : select u1_0.user_id,u1_0.username,u1_0.email from users u1_0 where u1_0.status='ACTIVE'`
