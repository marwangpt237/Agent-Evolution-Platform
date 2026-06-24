
// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import './agent-dashboard.css';

export default function AgentDashboard() {
  
  useEffect(() => {
    // Wrap script in a try-catch and IIFE to isolate scope and handle React StrictMode double invocations
    let isMounted = true;
    
    try {
      
    const state = {
        tasks: [],
        currentTaskId: null,
        isRunning: false,
        startTime: null,
        actionCounter: 0
    };

    const elements = {
        taskInput: document.getElementById('taskInput'),
        contextInput: document.getElementById('contextInput'),
        submitBtn: document.getElementById('submitBtn'),
        stopBtn: document.getElementById('stopBtn'),
        actionLog: document.getElementById('actionLog'),
        resultsPanel: document.getElementById('resultsPanel'),
        taskList: document.getElementById('taskList'),
        statusDot: document.getElementById('statusDot'),
        statusText: document.getElementById('statusText'),
        mainTitle: document.getElementById('mainTitle'),
        fsmState: document.getElementById('fsmState'),
        llmProvider: document.getElementById('llmProvider'),
        tokensUsed: document.getElementById('tokensUsed'),
        elapsedTime: document.getElementById('elapsedTime'),
        memoryList: document.getElementById('memoryList')
    };

    // ── Task Manager ──
    class TaskManager {
        static create(input, context) {
            const id = Date.now().toString();
            const task = {
                id,
                input,
                context,
                status: 'running',
                startTime: Date.now(),
                actions: [],
                result: null,
                tokens: 0
            };
            state.tasks.unshift(task);
            state.currentTaskId = id;
            this.persist();
            return task;
        }

        static getCurrent() {
            return state.tasks.find(t => t.id === state.currentTaskId);
        }

        static addAction(type, label, content, data = {}) {
            const task = this.getCurrent();
            if (!task) return;

            const action = {
                type,
                label,
                content,
                timestamp: Date.now() - task.startTime,
                ...data
            };
            task.actions.push(action);
            this.persist();
            return action;
        }

        static updateTaskStatus(status, result = null) {
            const task = this.getCurrent();
            if (!task) return;

            task.status = status;
            if (result) task.result = result;
            this.persist();
        }

        static updateTokens(count) {
            const task = this.getCurrent();
            if (!task) return;
            task.tokens = count;
        }

        static persist() {
            localStorage.setItem('algdevs_tasks', JSON.stringify(state.tasks));
        }

        static load() {
            const saved = localStorage.getItem('algdevs_tasks');
            if (saved) {
                state.tasks = JSON.parse(saved);
            }
        }
    }

    // ── UI Manager ──
    class UIManager {
        static renderTaskList() {
            elements.taskList.innerHTML = '';
            state.tasks.forEach(task => {
                const btn = document.createElement('button');
                btn.className = `task-item ${task.status}`;
                btn.textContent = task.input.slice(0, 35) + (task.input.length > 35 ? '...' : '');
                btn.onclick = () => this.selectTask(task.id);
                if (task.id === state.currentTaskId) btn.classList.add('active');
                elements.taskList.appendChild(btn);
            });
        }

        static selectTask(taskId) {
            state.currentTaskId = taskId;
            this.updateUI();
        }

        static updateUI() {
            const task = TaskManager.getCurrent();
            if (!task) return;

            elements.mainTitle.textContent = `Task: ${task.input.slice(0, 40)}...`;

            // Render action log
            elements.actionLog.innerHTML = '';
            task.actions.forEach(action => {
                const div = document.createElement('div');
                div.className = `action-entry ${action.type}`;

                const time = this.formatTime(action.timestamp);
                const label = `<span class="action-label ${action.type}">${action.label}</span>`;
                const text = `<span class="action-text">${action.content}</span>`;

                let html = `${label}${text}<br><span class="action-time">[${time}]</span>`;

                if (action.code) {
                    html += `<div class="code-block">${action.code}</div>`;
                }

                div.innerHTML = html;
                elements.actionLog.appendChild(div);
            });

            // Update state display
            elements.tokensUsed.textContent = task.tokens;
            this.updateStatus(task.status);

            // Update results
            if (task.result) {
                elements.resultsPanel.innerHTML = `<div class="results-content">${task.result}</div>`;
            }

            this.renderTaskList();
        }

        static updateStatus(status) {
            elements.statusDot.classList.remove('running', 'success', 'error');
            if (status === 'running') {
                elements.statusDot.classList.add('running');
                elements.statusText.textContent = 'running';
            } else if (status === 'success') {
                elements.statusDot.classList.add('success');
                elements.statusText.textContent = 'completed';
            } else if (status === 'error') {
                elements.statusDot.classList.add('error');
                elements.statusText.textContent = 'failed';
            } else {
                elements.statusText.textContent = 'ready';
            }
        }

        static formatTime(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        }

        static updateElapsedTime() {
            const task = TaskManager.getCurrent();
            if (task && state.isRunning) {
                const elapsed = Math.floor((Date.now() - task.startTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                elements.elapsedTime.textContent = `${minutes}m ${seconds}s`;
            }
        }
    }

    // ── Agent Executor (simulation) ──
    async function executeTask() {
        const input = elements.taskInput.value.trim();
        const context = elements.contextInput.value.trim();

        if (!input) return;

        state.isRunning = true;
        elements.submitBtn.disabled = true;
        elements.submitBtn.classList.add('hidden');
        elements.stopBtn.classList.remove('hidden');

        const task = TaskManager.create(input, context);
        UIManager.updateUI();

        // Simulate agent execution
        try {
            // Step 1: Parse task
            TaskManager.addAction('state', 'STATE', 'Parsing task input');
            UIManager.updateUI();
            await delay(300);

            // Step 2: Plan
            TaskManager.addAction('state', 'STATE', 'FSM: planning → execution');
            elements.fsmState.textContent = 'planning';
            UIManager.updateUI();
            await delay(500);

            // Step 3: LLM call
            TaskManager.addAction('tool-call', 'LLM', `Calling Claude (fallback: DeepSeek)`, {
                code: `prompt: "${input}"\ncontext: "${context}"`
            });
            elements.llmProvider.textContent = 'claude-3.5';
            UIManager.updateUI();
            await delay(1000);

            // Step 4: Tool execution examples
            if (Math.random() > 0.5) {
                TaskManager.addAction('tool-call', 'WEB', 'Searching for information', {
                    code: 'search("' + input.slice(0, 40) + '")'
                });
                UIManager.updateUI();
                await delay(600);

                TaskManager.addAction('success', 'WEB', 'Retrieved 5 relevant sources');
                UIManager.updateUI();
                await delay(300);
            }

            // Step 5: Code execution
            TaskManager.addAction('tool-call', 'CODE', 'Executing analysis script', {
                code: `import json\nresult = analyze("${input}")\nprint(result)`
            });
            UIManager.updateUI();
            await delay(800);

            TaskManager.addAction('success', 'CODE', 'Script executed successfully');
            UIManager.updateUI();
            await delay(300);

            // Step 6: Memory update
            TaskManager.addAction('state', 'MEMORY', 'SQLite: storing results');
            elements.memoryList.innerHTML = `
                <div class="memory-item">task_id: ${task.id}</div>
                <div class="memory-item">status: completed</div>
                <div class="memory-item">actions: 6</div>
            `;
            UIManager.updateUI();
            await delay(400);

            // Step 7: Results
            const result = `Task: ${input}\n\nAnalysis completed with 6 actions.\n- Parsed input\n- Planned execution\n- Called LLM\n- Retrieved sources\n- Executed code\n- Stored in SQLite`;

            TaskManager.addAction('success', 'COMPLETE', 'Task completed');
            TaskManager.updateTaskStatus('success', result);
            TaskManager.updateTokens(Math.floor(Math.random() * 2000) + 500);
            UIManager.updateUI();

        } catch (error) {
            TaskManager.addAction('error', 'ERROR', error.message);
            TaskManager.updateTaskStatus('error');
            UIManager.updateUI();
        }

        state.isRunning = false;
        elements.submitBtn.disabled = false;
        elements.submitBtn.classList.remove('hidden');
        elements.stopBtn.classList.add('hidden');
    }

    function delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ── Event Listeners ──
    elements.submitBtn.addEventListener('click', executeTask);

    elements.stopBtn.addEventListener('click', () => {
        state.isRunning = false;
        const task = TaskManager.getCurrent();
        if (task && task.status === 'running') {
            TaskManager.updateTaskStatus('error', 'Task interrupted');
            UIManager.updateUI();
        }
        elements.submitBtn.disabled = false;
        elements.submitBtn.classList.remove('hidden');
        elements.stopBtn.classList.add('hidden');
    });

    elements.taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) executeTask();
    });

    // ── Timer ──
    const intervalId = setInterval(() => UIManager.updateElapsedTime(), 1000);

    // ── Init ──
    TaskManager.load();
    UIManager.renderTaskList();
    if (state.tasks.length > 0) {
        state.currentTaskId = state.tasks[0].id;
        UIManager.updateUI();
    }

    elements.taskInput.focus();


      
      // Cleanup function to clear interval if we navigate away
      return () => {
        isMounted = false;
        clearInterval(intervalId);
      };
    } catch(e) {
      console.error(e);
    }
  }, []);


  return (
    <div className="agent-dashboard">
      <div className="app">
    {/*  SIDEBAR  */}
    <aside className="sidebar" id="sidebar">
        <div className="sidebar-header">
            <div className="logo">✦</div>
            <div className="logo-text">AlgDevs</div>
        </div>

        <div className="sidebar-section">Tasks</div>
        <div id="taskList"></div>
    </aside>

    {/*  MAIN  */}
    <main className="main">
        <header className="main-header">
            <div className="header-title" id="mainTitle">AlgDevs AI Agent</div>
            <div className="header-status">
                <div className="status-dot" id="statusDot"></div>
                <span id="statusText">ready</span>
            </div>
        </header>

        <div className="content">
            {/*  LEFT: Task Input & State  */}
            <div style={{"display":"flex","flexDirection":"column","gap":"16px"}}>
                <div className="panel">
                    <div className="panel-header">Task Input</div>
                    <div className="panel-body">
                        <div className="input-group">
                            <label className="input-label">Task</label>
                            <textarea id="taskInput" placeholder="Describe your task..." rows={6}></textarea>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Context (optional)</label>
                            <textarea id="contextInput" placeholder="Additional context..." rows={2}></textarea>
                        </div>
                        <div className="input-actions">
                            <button className="btn btn-primary" id="submitBtn">Execute Task</button>
                            <button className="btn btn-danger hidden" id="stopBtn">Stop</button>
                        </div>
                    </div>
                </div>

                <div className="panel" style={{"flex":"1"}}>
                    <div className="panel-header">Agent State</div>
                    <div className="panel-body">
                        <div className="agent-state">
                            <div className="state-item">
                                <div className="state-label">Current FSM State</div>
                                <div className="state-value" id="fsmState">idle</div>
                            </div>
                            <div className="state-item">
                                <div className="state-label">LLM Provider</div>
                                <div className="state-value" id="llmProvider">claude</div>
                            </div>
                            <div className="state-item">
                                <div className="state-label">Tokens Used</div>
                                <div className="state-value" id="tokensUsed">0</div>
                            </div>
                            <div className="state-item">
                                <div className="state-label">Elapsed</div>
                                <div className="state-value" id="elapsedTime">0s</div>
                            </div>
                        </div>
                        
                        <div style={{"marginTop":"12px"}}>
                            <div className="state-label">Memory (SQLite)</div>
                            <div className="memory-list" id="memoryList">
                                <div className="memory-item">Ready for task</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/*  RIGHT: Action Log & Results  */}
            <div style={{"display":"flex","flexDirection":"column","gap":"16px"}}>
                <div className="panel">
                    <div className="panel-header">Action Log</div>
                    <div className="panel-body action-log" id="actionLog">
                        <div className="action-entry state">
                            <span className="action-label state">STATE</span>
                            <span className="action-text">Agent initialized</span>
                            <br />
                            <span className="action-time">[00:00:00]</span>
                        </div>
                    </div>
                </div>

                <div className="panel" style={{"flex":"1"}}>
                    <div className="panel-header">Results & Output</div>
                    <div className="panel-body" id="resultsPanel">
                        <div style={{"color":"var(--text-muted)","fontSize":"12px"}}>
                            Execute a task to see results
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </main>
</div>


    </div>
  );
}
