# Activity Diagram Tool - Syntax Guide

## URL
https://oracle-plan-visualizer.vercel.app/activity-diagram

## Basic Syntax

### 1. Start/End Nodes
```
start
-> some activity
end
```

### 2. Activities
```
-> activity name
-> another activity
-> [edge label] activity with labeled edge
```

### 3. Decisions (If/Else) - Horizontal Branching
```
if (condition?) then
 -> [yes] action when true
else
 -> [no] action when false
endif
```

**Visual:** Then branch goes RIGHT, else branch goes LEFT, then merges back.

### 4. Fork/Join (Parallel Activities)
```
fork
-> parallel task 1
-> parallel task 2
join
```

### 5. Swimlanes (Multiple Actors/Threads)
```
lane Thread 1
start
-> idle
-> user action

lane Thread 2
start
-> check commands
-> process
```

### 6. Cross-Lane Connections
```
lane Client
-> send request

lane Server
-> receive request

# Connect across lanes
Client: send request -> Server: receive request
```

**Syntax:** `LaneName: node label -> LaneName: node label`

### 7. Comments
```
# This is a comment
-> activity  # Comments are ignored
```

## Complete Example

```
lane gRPC Client
start
-> idle
-> send save request (EventDiaryV2Request)
-> receive response (EventDiaryV2)
-> idle

lane Diary Service - gRPC Handler
start
-> idle
-> receive save request
-> validate request
-> convert protobuf to domain (EventDiaryModelMapper)
-> call createEventDiaryAsync()
-> return CompletableFuture
if (async processing complete?) then
 -> [yes] build response (EventDiaryV2)
 -> send response via StreamObserver
 -> log success
else
 -> [no] wait for async completion
endif
-> idle

lane Diary Service - Async Executor
start
-> idle
-> execute createEventDiaryAsync
-> apply content template (DiaryContentTemplateConfigQueryService)
-> save to database (EventDiaryCommandService.save)
-> publish EventDiaryCreatedEvent
if (transaction committed?) then
 -> [yes] trigger EventDiaryEventListener
 -> sync to C7 (EventDiarySyncC7CommandService)
 if (C7 sync success?) then
 -> [yes] log success
 -> update isSendC7 = true
 else
 -> [no] log error
 -> update isSendC7 = false
 endif
 -> send MQTT notification (NotificationMqttService)
 if (MQTT success?) then
 -> [yes] log success
 else
 -> [no] log error (non-blocking)
 endif
 -> complete CompletableFuture
else
 -> [no] rollback transaction
 -> complete CompletableFuture exceptionally
endif
-> idle

# Cross-lane connections
gRPC Client: send save request (EventDiaryV2Request) -> Diary Service - gRPC Handler: receive save request
Diary Service - gRPC Handler: call createEventDiaryAsync() -> Diary Service - Async Executor: execute createEventDiaryAsync
Diary Service - Async Executor: complete CompletableFuture -> Diary Service - gRPC Handler: async processing complete?
```

## Export Options

1. **Copy** - Copy diagram definition to clipboard
2. **Copy SVG** - Copy SVG code to clipboard
3. **Copy XML** - Copy draw.io XML to clipboard
4. **Export SVG** - Download as .svg file
5. **Export PNG** - Download as .png file
6. **Export XML** - Download as .xml file (can import to draw.io)

## Features

- ✅ Swimlane support (multiple lanes)
- ✅ Horizontal branching for if/else decisions
- ✅ Cross-lane connections with elbow routing
- ✅ Start/end, activities, decisions, fork/join
- ✅ Export to SVG, PNG, XML (draw.io compatible)
- ✅ Copy definition, SVG, XML to clipboard
- ✅ Sahara design theme
- ✅ Real-time preview

## Tips

1. **Labels with special chars:** Use parentheses, hyphens, spaces freely
2. **Long labels:** Tool auto-wraps text for readability
3. **Nested decisions:** You can nest if/else blocks
4. **Cross-lane syntax:** Must match exact label (case-insensitive)
5. **Comments:** Use `#` prefix for documentation

## When to Use Activity Diagram

**✅ Use when:**
- Model business processes
- Document system behavior
- Parallel activities (multi-threading)
- Cross-functional workflows (swimlanes)
- Complex decision logic
- Async operations (gRPC, message queues)

**❌ Don't use when:**
- Object interactions → use Sequence Diagram
- Class structure → use Class Diagram
- State transitions → use State Machine Diagram
- Simple linear flow → use Flowchart

## Design Philosophy

This tool combines:
- **PlantUML** - Text-to-diagram approach
- **draw.io** - Visual quality + XML export
- **Mermaid** - Simple syntax

Result: Fast text-based diagramming with professional output!

---

**Created:** 2026-04-14  
**Tool:** MyDevTools - Activity Diagram  
**Repo:** duynguyendevit-ux/oracle-plan-visualizer
