# starfall-qwen3.8flashnext
[Autonomous AI Dev]: A bullet-heaven Asteroids-like by Qwen 3.8 Flash Next

This is essentially a Flash Next tech demo.
If you give Flash Next a comprehensive game dev plan, what happens?
In my case, it's been autonomously building a Asteroids clone for 5 days, and it has only exhibited a single trivial bug, i.e. a text overflow bug. When I pointed out the issue, it fixed every string and the issue did not recur.
Flash Next uses headless testing and a comprehensive testing harness (1,646 tests and growing) to near eliminate production bugs.
The game has not crashed a single time through hours of human play-testing.
reasoning_effort is set to the default xhigh to minimize bugs.

Some fun dev stats for my Flash Next @ Strix Halo dev loop:
- Running since: 6 October 2026, about 107 hours so far
- Sessions: 102, each starting with no memory of the last
- Commits: 344, of which 342 by the agent
- Releases: 78, newest v0.10.2
- Game code: 93 files, 31,802 lines
- Tests: 156 files, 42,039 lines, 1,646 tests
- Tools the agent built for itself (simulators, bots, balance checks): 26 files, 8,726 lines
- Lines written in total: 94,590 added, 8,385 removed
- The agent's own notes between sessions: 11,175 lines (855 KB)
- Thinking and work log: 32.4 MB of text, roughly 8 million tokens
- Tool calls made: 14,036

### Technical Preface
Just a few weeks back I acquired a MINISFORUM MS-S1 MAX with a AI Max+ 395 and shared 128 GB RAM. This little box is capable of running Qwen 3.8 Flash Next at Q4 effortlessly at around 50-70 TPS using Halogen. For any fencesitters I can highly recommend this box, currently sitting at $3,879 USD, directly available from Minisforum.
That said, now that we have Strata, anyone with a 12 GB VRAM card can replicate what I'm doing, at just a slightly higher wattage.

Qwen 3.8 Flash Next represents a significant leap in overall competence over Qwen 3.8 27B, with an impressive intelligence score of 41.
The "Next" in the title signifies that it belongs to the next generation: Qwen 4. It is a preview of what is to come.

### The Game Itself
First, Opus 5.5 drew up a detailed game development plan with minimal input from my side, and the game in its current state is a result of about 4-5 days of continuous iteration, day and night. The code base is already quite large, with a wild number of tests. The sheer amount of code written is reminiscent of perhaps about 2-3 months of human development, assuming a competent and experienced game developer who moves fast.

The game itself is, frankly, quite bare bones, but it contains the secret sauce of Vampire Survivor and its innumerable successors.
I call them pachinko clones. I cannot make up my mind: Are they dopamine-draining nonsense games, or perhaps zen-like?
I am not sure of the neurobiology to be honest. Perhaps your neurobiological reaction to these games depends on whether you've yet attained a high level of Hedonic Adaptation.
While it's rather likely these games are potentially addictive, the way real-life pachinko and gambling can be to some people, I think they are rather innocuous as long as you don't keep playing them forever.

I'd rate this game a 3/10, but in terms of feeling fun and addictive due to the pachinko-esque bullet heaven aspect, it's even a 6/10. It is kind of like a ... Feature sandbox. And it's still highly generic.
However, it's getting quite detailed and nuanced!

It's like a very elaborate mediocre game. currently, the bosses are particularly uninspired.

Nonetheless, the current goal is for Flash Next to continue the entire `PLAN.md`, and I expect to reach completion within a few days.
As of the time of writing this, v0.10.2 has been published.

Once the plan is entirely done, I will consider whether to iterate further or not.
Primarily I hope to learn something from this silly process, primarily to study the operating mode of Flash Next by reading its voluminous thinking.
Indeed, the LLM has so far thought more than 22 megabytes of text, in just a few days.

### The Music
The music is hand-written without external tools, thus it is rather simple.
If I keep this up, I will use various means later to make the music far better.
For now I am not disappointed in Flash Next's ability to put together rudimentary music.

### The Graphics
There really are no graphics. Just placeholders. I might look into Blender object sculpting or sprites after PLAN.md blueprint has been completed.

