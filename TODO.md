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

As part of doing this, I could write a simulation editor. Like I could add functionality to the frontend to adjust sliders that control the behavior of the simulation.
We need to make the frontend look better.

Try to fix the bug where the sheep get sucked into the the edge of a boundary.

Try to implement the path-planning around obstacles.


Frontend TODOs:
- Make the background scroll with the panning.
    - Could probably leave it in the background so that we can just use the repeat thing and then just change the offset.
- Make the play/pause & reset be on the bottom.
- Have an indicator for when the drone is barking and when it's just


Planner TODOs:
- It got stuck at one point because it was trying to herd the sheep towards the GCM but it really didn't want to push them in the wrong direction.
- It literally gets stuck all the time when I look at it on the frontend.

We should spend some time trying to polish what we have before the midterm presentation.
- We should leave obstacles where they're at. (unless Joel has something to clean up here.)
- We should make the zooming and panning feel cleaner.
- We should fix up the frontend UI.
- We should get flyover working to where it isn't obviously terrible.
- We should fix up the sheep sim so that it looks more realistic. (This one might be a lot of work.)
    - We should tone down the random motion
    - As a stretch, we should have the sheep be a bit more fluid in terms of which mode they choose to be in.
