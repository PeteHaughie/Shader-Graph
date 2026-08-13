# Holding the Artefact: A Primer on AI, Semantic Graphs, and Persistent Possibility

> "I will show you when I've written more of it, but know that I'm knee deep in the bit where I build a structured code editor on top of a graph database on top of a columnar database" — M. Carroll

## The central idea

The conventional AI coding model treats a program as **text**.

An AI receives files containing strings, edits those strings, and hopes the resulting text remains a valid program.

The alternative we've been circling is:

> **Represent the thing being programmed as a structured, semantic object, and let the AI manipulate that object rather than manipulating source text directly.**

Source code then becomes one possible *output representation* of that object.

This is not an entirely new idea. Compiler theory, functional programming, databases, version control, programming language research, and declarative UI systems have been independently developing pieces of it for decades.

The interesting question is whether those pieces can be assembled into a particularly effective environment for AI.

---

# 1. Source code is not the program

Consider:

```text
foo(x) {
    return bar(x) + 1;
}
```

A text editor sees characters.

A compiler sees something more like:

```text
Function
├── name: foo
├── parameter: x
└── body
    └── return
        └── addition
            ├── call: bar(x)
            └── literal: 1
```

The second representation contains considerably more information about what the program *is*.

This distinction is fundamental.

**Source code is a serialisation of a program. It does not necessarily have to be the program's fundamental representation.**

---

# 2. Abstract Syntax Trees

The first established mechanism for moving away from strings is the **Abstract Syntax Tree (AST)**.

A parser transforms source text into a tree representing its syntactic structure.

For example:

```text
(+ (* 2 3) 4)
```

can be understood as:

```text
       +
      / \
     *   4
    / \
   2   3
```

This allows tools to perform structural operations.

Instead of:

> Find the string `foo` and replace it.

a tool can ask:

> Find function calls whose callee is `foo`.

This is the territory occupied by tools such as Tree-sitter and traditional compiler front-ends.

---

# 3. Semantic representations

An AST still primarily describes **syntax**.

A more sophisticated representation can include meaning:

```text
Function: authenticate
├── returns: User
├── calls: validate_credentials
├── reads: UserDatabase
├── writes: SessionStore
└── throws: AuthenticationError
```

Now the system can reason about relationships.

This is where the idea starts moving toward a **graph**.

---

# 4. Graphs

A graph represents entities and their relationships.

For a program:

```text
authenticate
     │
     ├── calls ──→ validate_credentials
     │
     ├── reads ──→ UserDatabase
     │
     └── writes ─→ SessionStore
```

The important thing is that relationships become first-class objects.

This makes questions such as these natural:

* What calls this function?
* What does this function depend on?
* What will be affected if I change this?
* What code ultimately depends on this database?
* Which functions mutate this object?
* What parts of the program implement authentication?

A graph database is one possible implementation of this idea.

It is not necessarily required.

---

# 5. Intermediate representations

Compiler systems have long used **Intermediate Representations (IRs)**.

A compiler might transform:

```text
C++
 ↓
AST
 ↓
semantic analysis
 ↓
IR
 ↓
machine code
```

The IR exists because source code is often not the ideal representation in which to analyse and transform a program.

LLVM IR is a famous example.

MLIR extends this concept by supporting multiple levels of abstraction and domain-specific representations.

The important principle is:

> **There is no requirement that the representation humans write should also be the representation machines use to reason about the program.**

This may be particularly important for AI.

---

# 6. Domain-specific representations

A single universal representation may not be desirable.

Different domains have different meaningful primitives.

A shader might naturally contain:

```text
Texture
Noise
Blur
Mask
Composite
Output
```

A design system might contain:

```text
Component
Variant
State
Token
Constraint
Layout
```

An audio system might contain:

```text
Oscillator
Filter
Envelope
Delay
Mixer
Output
```

A conventional programming language reduces all of these to generic language constructs.

A domain-specific representation can preserve the concepts humans actually care about.

---

# 7. The AI should manipulate meaning, not implementation

Suppose a shader system has a primitive:

```text
GaussianBlur(
    input: Image,
    radius: PositiveFloat
)
```

The AI can request:

```text
GaussianBlur(image, 12)
```

It does not need to invent the GLSL implementation of Gaussian blur.

A deterministic system already knows how to implement it.

This creates a useful separation:

```text
AI
 ↓
semantic intent
 ↓
structured representation
 ↓
deterministic compiler
 ↓
GLSL
```

The AI chooses **what**.

The compiler determines **how**.

---

# 8. Primitive libraries

A semantic environment can provide a controlled vocabulary of primitives.

For shaders:

```text
Texture
Noise
Blur
Distort
Threshold
ColourGrade
Composite
```

For UI:

```text
Button
Card
Modal
Navigation
Grid
Stack
```

For a design system:

```text
PrimaryAction
DestructiveAction
Surface
TypographyScale
SpacingScale
FocusState
```

Each primitive can have:

* a defined meaning
* typed inputs
* typed outputs
* valid parameter ranges
* deterministic implementations
* validation rules
* potentially multiple target implementations

This creates a constrained semantic space in which an AI can operate.

---

# 9. Why constraints matter

Without constraints, the AI merely gets another programming language.

A useful semantic system might define:

```text
Blur
input: Image
radius: PositiveFloat
output: Image
```

Therefore:

```text
Blur(Button, "purple")
```

is simply invalid.

The system can reject it before generating executable code.

This moves some responsibility for correctness away from probabilistic AI and into deterministic machinery.

---

# 10. Deterministic code generation

Eventually the semantic representation must become something executable.

The transformation might be:

```text
Semantic graph
      ↓
Validation
      ↓
Lowering
      ↓
Intermediate representation
      ↓
Optimisation
      ↓
Code generation
      ↓
GLSL / CSS / C++ / JavaScript / etc.
```

This is essentially compiler technology.

The crucial principle is:

> **Do not ask the AI to generate something that deterministic machinery can generate more reliably.**

If a compiler can produce correct GLSL from a semantic graph, let the compiler produce the GLSL.

---

# 11. CSS as a semantic system

CSS is less obviously a programming language, but a design system provides a strong semantic vocabulary.

Instead of asking an AI to modify:

```css
.button--primary:hover {
    ...
}
```

the system could represent:

```text
Button
├── variant: Primary
├── state: Hover
├── surface: Brand
├── text: OnBrand
└── radius: ControlRadius
```

The system can then compile that representation into CSS.

The AI is manipulating **design intent**, not CSS syntax.

This could also make the same representation target:

* CSS
* HTML
* React
* native UI frameworks
* other rendering systems

---

# 12. Shaders are particularly promising

Shaders are naturally expressed as dataflow graphs.

For example:

```text
Texture
   │
   ├─────────→ Colour
   │              │
   ▼              ▼
 Noise ───────→ Multiply
                   │
                   ▼
                  Blur
                   │
                   ▼
                 Output
```

This graph can be represented directly.

The AI could manipulate the graph while a deterministic compiler emits GLSL, HLSL, WGSL, Metal, etc.

This is essentially the conceptual foundation of node-based visual programming, but with the possibility of giving the AI direct access to the semantic graph rather than forcing it through a graphical editor.

---

# 13. Immutability

Now we reach the particularly strange part of your friend's system.

An **immutable** object cannot be modified in place.

Instead of:

```text
Program A
   ↓
modify A
   ↓
Program B
```

the system retains A and creates B:

```text
Program A ─────→ Program B
```

Both still exist.

This is a fundamental idea in functional programming and persistent data structures.

It means experimentation does not have to destroy previous states.

---

# 14. Merkle trees

A Merkle structure gives objects identities derived from their contents.

Very roughly:

```text
        hash(A)
       /       \
  hash(B)     hash(C)
```

If B changes:

```text
        hash(A')
       /        \
  hash(D)      hash(C)
```

C can remain unchanged and be shared.

This is closely related to the architecture of systems such as Git and content-addressable storage.

The important property is:

> **A particular state can have a stable identity.**

---

# 15. Persistent graphs

Combine semantic graphs with immutability and content addressing.

Now a program can be represented as a persistent graph:

```text
Program State
├── Function A
├── Function B
├── Type C
├── Dependency D
└── Test E
```

Changing Function A produces another graph:

```text
Original
   │
   └──→ Modified
```

Unchanged parts can be shared.

You do not need to copy the entire program for every possibility.

---

# 16. Time

If previous states are immutable and retained, the system has a natural history.

```text
State A
  ↓
State B
  ↓
State C
  ↓
State D
```

The system can return to A, B, or C without reconstructing them from a patch history.

The past is still present.

This is what your friend means by **“travel in time.”**

---

# 17. Possibility

The same mechanism permits branching.

```text
                 Base
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
       Option A  Option B  Option C
          │
       ┌──┴──┐
       ▼     ▼
      A1     A2
```

Each branch represents a possible future.

The AI can explore them without destroying the original state.

It could theoretically:

1. create a branch
2. try an architectural change
3. run tests
4. create another branch
5. compare results
6. discard unsuccessful branches
7. return to the original state
8. try something else

This is **search through a space of possible programs**.

---

# 18. “Always find your way home again”

This is the poetic part of your friend's statement, but it describes a real technical property.

If the root state remains immutable:

```text
                    ROOT
                   /    \
                idea A  idea B
                  │
                idea C
```

the AI can always return to ROOT.

It doesn't need to undo hundreds of mutations.

It simply follows the reference.

This makes speculative AI activity much safer.

The AI can experiment without progressively corrupting the only copy of reality.

---

# 19. The resulting architecture

Putting everything together:

```text
                    HUMAN
                      │
                      ▼
                     AI
                      │
             semantic operations
                      │
                      ▼
             ┌─────────────────┐
             │ Structured      │
             │ semantic graph  │
             └────────┬────────┘
                      │
               immutable states
                      │
                Merkle identity
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       Branch A    Branch B    Branch C
          │           │           │
          └───────────┼───────────┘
                      │
                 chosen state
                      │
                      ▼
             deterministic compiler
                      │
                      ▼
              target representation
                      │
             ┌────────┼─────────┐
             ▼        ▼         ▼
            CSS      GLSL      C++
```

This is the "artefact" we've been gradually uncovering.

---

# 20. Existing technology

You do **not** need to invent all of this from scratch.

Relevant existing ideas and technologies include:

### Tree-sitter

Parses many programming languages into structural syntax trees and supports structural queries.

### LSP

Provides semantic programming operations such as definitions, references, symbols, diagnostics and renaming.

### LSIF

Provides a persistent, graph-oriented representation of language-server information.

### LLVM

A mature compiler infrastructure based around intermediate representations.

### MLIR

An infrastructure for multiple levels of intermediate representation and domain-specific compiler abstractions.

### Git / Merkle-style storage

Demonstrates the practical usefulness of immutable, content-addressed histories and branching.

### Declarative UI systems

React, SwiftUI, Jetpack Compose and similar systems demonstrate the usefulness of describing desired UI structure rather than imperatively manipulating widgets.

### Node-based environments

Shader graphs, audio DSP systems, visual programming environments and similar tools demonstrate that many domains naturally lend themselves to graph representations.

### MCP

Provides a standard mechanism for exposing structured tools and data to AI models.

None of these individually constitutes your friend's system.

They are pieces of the conceptual machinery.

---

# 21. The potentially new bit

The interesting frontier isn't necessarily any individual technology.

It is the combination:

> **AI + semantic representation + persistent graph + deterministic compilation**

The AI doesn't have to manipulate source text.

It manipulates a semantic world.

That world has:

* typed entities
* meaningful relationships
* immutable history
* branching possibilities
* deterministic transformations
* a compiler back into conventional representations

The AI therefore becomes less like a typist and more like an explorer.

---

# 22. A useful mental model

The conventional model is:

```text
Human
  ↓
source code
  ↓
compiler
  ↓
program
```

The AI-assisted version most people currently use is:

```text
Human
  ↓
AI
  ↓
source code
  ↓
compiler
  ↓
program
```

The model we're discussing is:

```text
Human
       ↘
        AI
         ↓
   semantic world
         ↓
  explore possibilities
         ↓
    choose a state
         ↓
 deterministic compiler
         ↓
     real program
```

The source code becomes an **output format** rather than the fundamental object of manipulation.

---

# 23. The question worth exploring

The biggest unresolved question isn't:

> “Can we build this?”

We clearly can build pieces of it.

The more interesting question is:

> **What is the right semantic representation for a given domain?**

For shaders, it might be a dataflow graph.

For a design system, it might be components, constraints, tokens and relationships.

For application code, it might combine ASTs, types, control flow, dependencies, state and domain semantics.

There probably isn't one universal answer.

The "better way of holding it" may be **domain-specific representations connected by well-defined translations**.

---

# 24. The Roadside Picnic interpretation

The metaphor now has a fairly precise technical correspondence.

**The artefact:**
The semantic representation of a program.

**The Zone:**
The persistent space of possible program states.

**The Stalker:**
The AI exploring that space.

**The artefact's strange physics:**
The rules and constraints of the semantic representation.

**The safe path:**
Typed operations and deterministic transformations.

**The rope/string leading home:**
Immutable references to previous states.

**The wish machine:**
The deterministic compiler that turns a selected semantic state into something executable.

And perhaps the most important principle:

> **The Stalker should not have to understand the artefact's internal physics in order to use it safely.**

The AI doesn't need to know how the compiler implements Gaussian blur.

It needs to know that `Blur(Image, PositiveFloat)` is a valid operation.

The system handles the rest.

---

# 25. Where to start experimentally

There is no need to build the entire universe.

A useful experiment would be deliberately tiny:

**Pick one domain you already understand extremely well — GLSL is an excellent candidate.**

Define perhaps ten semantic primitives:

```text
Texture
Noise
Mix
Multiply
Add
Blur
Mask
Distort
ColourTransform
Output
```

Represent a shader as an immutable graph.

Give an AI tools to:

* inspect the graph
* add nodes
* remove nodes
* reconnect nodes
* modify parameters
* branch the current state
* compare states
* compile a selected graph to GLSL
* run the shader
* inspect compilation/runtime errors

Then ask a very simple question:

> **Is the AI better at creating and modifying shaders when it is manipulating the graph rather than writing GLSL?**

That experiment would tell you considerably more than building a grand unified AI programming environment.

---

## The short version

Your friend has apparently been working toward something that can be summarised as:

> **Don't make the AI edit the artefact's description. Give it the artefact itself, in a representation it can manipulate safely.**

Then make that artefact:

**structured → typed → connected → immutable → versioned → branchable → compilable.**

That's the "holding it correctly" idea we've been circling.

And the really interesting phrase in your friend's message is probably not **“Merkle trees.”**

It's:

> **“travel in time and possibility.”**

Because that's where a sophisticated version of this stops being merely an alternative code editor and starts becoming an **environment in which an AI can explore possible computational worlds without destroying the one it started from.**
