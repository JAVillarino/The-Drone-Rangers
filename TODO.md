Add the ability to make the cool looking ghost image of where the dots were over time. Then we can compare that between different algorithms.


Random Ideas:
- Two modes for frontend - one where you know you're interacting with a simulation backend, and one where you aren't. For the simulation backend, you have a bunch of additional features:
    - Ability to speed up / fast-forward time.
    - Ability to go back in time.
    - Ability to pause.


We should just be able to submit the benchmark on the scenarios for every weekly check-in. Hopefully we'll gradually improve, and we can gradually add more benchmarks.

Okay I'm actually going to finish out the benchmarks so we can submit them.
Okay we need to be able to run it a little bit faster so I'll only do one trial of each. The additional seed wasn't bringing much signal anyways. Then I need the ability to load in a specific trial.

High priority: Try to make the sheep look more like sheep.

Try to fix the bug where the sheep get sucked into the the edge of a boundary.

Try to implement the path-planning around obstacles.

When the drone goes away, the sheep should stop being in herding phase anyways.


Try to implement the multi-drone scoring system. This is annoying. We should be passing everything as multiple arrays because that's how we're computing it - it's much easier to be vectorized if that's how it's done.
- Okay let's see what we can do on this front, I think I just need to get the code to run and then I'll be able to adjust it from there.
- Alright, it seems like it's more or less working. Next thing is to make it work with multiple drones.